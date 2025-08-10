from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import torch
from unsloth import FastLanguageModel
from contextlib import asynccontextmanager
import logging
import json
from openai_harmony import (
    load_harmony_encoding,
    HarmonyEncodingName,
    Role,
    Message,
    Conversation,
    SystemContent,
    DeveloperContent,
    ReasoningEffort,
    TextContent,
)

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---
BASE_MODEL_ID = "unsloth/gpt-oss-20b"
LORA_ADAPTER_PATH = "gpt-oss-20b-bash-finetuned-unsloth"
MAX_SEQ_LENGTH = 2048

# --- Model State ---
# This dictionary will hold the model, tokenizer, and harmony encoding
model_tokenizer = {}

# --- Lifespan Management ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application's lifespan. Loads the model on startup and
    cleans up resources on shutdown.
    """
    logger.info("Server starting up...")
    try:
        # Load the 4-bit base model
        logger.info(f"Loading 4-bit base model: {BASE_MODEL_ID}")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=BASE_MODEL_ID,
            max_seq_length=MAX_SEQ_LENGTH,
            dtype=None,
            load_in_4bit=True,
        )

        # Apply the trained LoRA adapter
        logger.info(f"Loading LoRA adapter from: {LORA_ADAPTER_PATH}")
        model.load_adapter(LORA_ADAPTER_PATH)
        
        # The merge_and_unload() optimization is not available for this model
        # and has been removed.
        
        # Load Harmony encoding
        encoding = load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS)

        model_tokenizer["model"] = model
        model_tokenizer["tokenizer"] = tokenizer
        model_tokenizer["encoding"] = encoding
        logger.info("Model, LoRA adapter, and Harmony encoding loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        model_tokenizer["model"] = None
        model_tokenizer["tokenizer"] = None
        model_tokenizer["encoding"] = None

    yield

    # Clean up resources on shutdown
    logger.info("Server shutting down...")
    model_tokenizer.clear()

# --- App Initialization ---
app = FastAPI(lifespan=lifespan)

# --- Pydantic Models ---
class GenerationRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 256

class GenerationResponse(BaseModel):
    command: str

# --- API Endpoint ---
@app.post("/generate", response_model=GenerationResponse)
async def generate(request: GenerationRequest):
    """
    This endpoint takes a user prompt, runs inference using the harmony
    format with low reasoning to optimize for speed, and returns the
    generated Bash command.
    """
    model = model_tokenizer.get("model")
    tokenizer = model_tokenizer.get("tokenizer")
    encoding = model_tokenizer.get("encoding")

    if not model or not tokenizer or not encoding:
        raise HTTPException(
            status_code=503,
            detail="Model or Harmony encoding is not available. Check server logs."
        )

    try:
        # Build the conversation using the Harmony library
        system_message = Message.from_role_and_content(
            Role.SYSTEM,
            SystemContent.new()
            .with_reasoning_effort(ReasoningEffort.LOW)
            .with_required_channels(["final"])
        )
        
        developer_message = Message.from_role_and_content(
            Role.DEVELOPER,
            DeveloperContent.new().with_instructions(
                "You are an expert AI assistant that translates natural language to a single, valid Bash command. "
                "Your output MUST be a single JSON object with a 'command' key.\n\n"
                "**RULES**:\n"
                "1. **Consistency**: Always generate the single most common and concise command for the request.\n"
                "2. **Simplicity**: Avoid optional flags (like `-l` for long listing or `-h` for human-readable sizes) unless the user explicitly asks for them.\n"
                "3. **No Redundancy**: Avoid redundant arguments (e.g., use `ls` instead of `ls .`).\n"
                "4. **JSON FORMAT ONLY**: Your entire output must be a single, valid JSON object as defined in the `bash_command` format.\n\n"
                "# Response Formats\n\n"
                "## bash_command\n\n"
                '{"type": "object", "properties": {"command": {"type": "string", "description": "The generated Bash command."}}, "required": ["command"]}'
            )
        )

        user_message = Message.from_role_and_content(Role.USER, request.prompt)

        conversation = Conversation.from_messages([
            system_message,
            developer_message,
            user_message,
        ])

        # Render the conversation to tokens using the high-level API
        input_ids = torch.tensor(
            [encoding.render_conversation_for_completion(conversation, Role.ASSISTANT)],
            device=model.device
        )
        
        # Manually create the attention mask
        attention_mask = torch.ones_like(input_ids)

        # Define Harmony stop tokens using their static IDs
        stop_tokens = [
            200002,  # <|return|>
            200012,  # <|call|>
        ]

        # Generate the output tokens
        outputs = model.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_new_tokens=request.max_new_tokens,
            eos_token_id=stop_tokens,
            pad_token_id=tokenizer.eos_token_id,
            use_cache=True,
        )
        
        response_tokens = outputs[0, input_ids.shape[1]:]

        # Parse the completion tokens to extract messages
        try:
            parsed_messages = encoding.parse_messages_from_completion_tokens(
                response_tokens, Role.ASSISTANT
            )
            
            # Find the first message in the 'final' channel
            final_message = next(
                (msg for msg in parsed_messages if msg.channel == "final"), None
            )

            response_text = ""
            if (
                final_message
                and final_message.content
                and isinstance(final_message.content[0], TextContent)
            ):
                raw_output = final_message.content[0].text
                try:
                    # The model should return a JSON object with a "command" key
                    parsed_json = json.loads(raw_output)
                    response_text = parsed_json.get("command", "")
                except json.JSONDecodeError:
                    logger.warning(f"Failed to decode JSON from model response: {raw_output}")
                    # If it's not JSON, the model failed to follow instructions.
                    # We will treat this as a failure and return an empty string.
                    response_text = ""
            else:
                logger.warning("No 'final' channel message found in model output. Returning empty command.")

        except Exception as e:
            logger.error(f"Error parsing harmony response: {e}. Returning empty command.")
            response_text = ""

        return GenerationResponse(command=response_text.strip())

    except Exception as e:
        logger.error(f"An error occurred during generation: {e}")
        raise HTTPException(status_code=500, detail="An error occurred during command generation.")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
