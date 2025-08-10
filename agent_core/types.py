from typing import List, Optional

from pydantic import BaseModel


class ExecuteGoalPayload(BaseModel):
    goal: str


class PlanGeneratedPayload(BaseModel):
    plan: List[str]


class StepExecutingPayload(BaseModel):
    step: str
    command: Optional[str] = None


class StepResultPayload(BaseModel):
    stdout: str
    stderr: str
    exit_code: int


class ErrorDetectedPayload(BaseModel):
    error: str
    failed_step: str


class RePlanningPayload(BaseModel):
    pass


class WorkflowCompletePayload(BaseModel):
    status: str
