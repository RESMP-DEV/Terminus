"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import StepCard from "@/components/StepCard";
import ArrowDownConnector from "@/components/ArrowDown";
import { OrchestrationEngine } from "@/lib/orchestration";
import { OrchestrationStep } from "@/lib/types";
import { RotateCcw, Wifi, WifiOff, Send, Loader2, Link as LinkIcon } from "lucide-react";

export default function Home() {
  const [steps, setSteps] = useState<OrchestrationStep[]>([]);
  const [engine] = useState(() => new OrchestrationEngine());
  const [isConnected, setIsConnected] = useState(false);
  const [goal, setGoal] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>(process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000");
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // Apply localStorage override only on client
    try {
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem("terminus.backendUrl");
        if (saved) setServerUrl(saved);
      }
    } catch {}

    const unsubscribe = engine.subscribe((newSteps) => {
      console.log("[React] Received step update:", newSteps.map(s => `${s.id}:${s.status}`).join(" | "));
      setSteps([...newSteps]); // Force new array reference for React
      
      // Hide planning state when we receive steps
      if (newSteps.length > 0 && isPlanning) {
        setIsPlanning(false);
      }
      
      // Auto-scroll to the currently executing or most recent step
      setTimeout(() => {
        // Find the executing step, or the last non-pending step
        let targetIndex = newSteps.findIndex(s => s.status === "executing");
        if (targetIndex === -1) {
          // No executing step, find the last step that's not pending
          for (let i = newSteps.length - 1; i >= 0; i--) {
            if (newSteps[i].status !== "pending") {
              targetIndex = i;
              break;
            }
          }
        }
        
        // Scroll to the target step if found
        if (targetIndex >= 0 && stepRefs.current[targetIndex]) {
          stepRefs.current[targetIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }, 100); // Small delay to ensure DOM is updated
      
      // Update execution state based on steps
      const hasActiveSteps = newSteps.some(s => s.status === "executing");
      const allCompleted = newSteps.every(s => s.status === "success" || s.status === "pending");
      setIsExecuting(hasActiveSteps && !allCompleted);
    });

    setSteps(engine.getSteps());

    // Subscribe to connection status changes
    const unsubscribeConnection = engine.subscribeConnection(setIsConnected);

    // Connect to backend
    engine.connect(serverUrl);

    return () => {
      unsubscribe();
      unsubscribeConnection();
      engine.destroy();
    };
  }, [engine, serverUrl]);

  const handleExecuteGoal = () => {
    if (goal.trim() && isConnected) {
      setGoal(goal.trim());
      setIsPlanning(true); // Start planning state
      setSteps([]); // Clear any previous steps
      engine.executeGoal(goal.trim(), serverUrl);
      
      // Fallback: hide planning state after 30 seconds if no response
      setTimeout(() => {
        setIsPlanning(false);
      }, 30000);
    }
  };

  const handleApplyServerUrl = () => {
    const url = serverUrl.trim();
    if (!url) return;
    try {
      const u = new URL(url);
      window.localStorage.setItem("terminus.backendUrl", u.toString());
      engine.connect(u.toString());
    } catch {
      // ignore invalid URL
    }
  };

  const handleReset = () => {
    engine.reset();
    setGoal("");
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleExecuteGoal();
    }
  };

  const visibleSteps = steps
    .map((step, originalIndex) => ({ step, originalIndex }))
    .filter(({ step }) => step.status !== "pending");

  return (
    <main className="min-h-screen bg-[#282828]">
      {/* Header */}
      <div className="bg-[#282828]/95 backdrop-blur-md border-b border-[#3c3836] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#458588]">
                Terminus
              </h1>
              <p className="text-[#a89984] text-sm">The Obvious Next Way To Interact With AI</p>
            </div>
            <div className="flex items-center space-x-3">
              {isConnected ? (
                <div className="flex items-center space-x-2 text-[#98971a]">
                  <Wifi className="w-4 h-4" />
                  <span className="text-sm">Connected</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-[#cc241d]">
                  <WifiOff className="w-4 h-4" />
                  <span className="text-sm">Disconnected</span>
                </div>
              )}
              <button
                onClick={handleReset}
                className="flex items-center space-x-2 px-4 py-2 bg-[#3c3836] text-[#ebdbb2] rounded-lg hover:bg-[#504945] transition-all duration-200 border border-[#504945]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Goal Input Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-[#3c3836] rounded-xl border border-[#504945] p-6 shadow-2xl mb-8"
        >
          <h3 className="text-lg font-semibold text-[#ebdbb2] mb-4">Execute Agent Goal</h3>

          {/* Backend URL Configuration */}
          <div className="mb-4">
            <label htmlFor="backend-url" className="block text-sm font-medium text-[#a89984] mb-2">
              Backend Server URL
            </label>
            <div className="flex space-x-2">
              <input
                id="backend-url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:8000"
                className="flex-1 p-2 bg-[#282828] border border-[#504945] rounded-lg focus:ring-2 focus:ring-[#458588] focus:border-[#458588] text-[#ebdbb2] placeholder:text-[#928374] transition-colors"
              />
              <button
                onClick={handleApplyServerUrl}
                className="px-3 py-2 bg-[#458588] text-white rounded-lg hover:bg-[#83a598] transition-all duration-200 flex items-center space-x-2"
              >
                <LinkIcon className="w-4 h-4" />
                <span>Apply</span>
              </button>
            </div>
          </div>

          {/* Goal Input */}
          <div className="mb-4">
            <label htmlFor="goal" className="block text-sm font-medium text-[#a89984] mb-2">
              Enter a goal for the agent to execute:
            </label>
            <div className="flex space-x-2">
              <textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Create a README.md file for this project"
                className="flex-1 p-3 bg-[#282828] border border-[#504945] rounded-lg focus:ring-2 focus:ring-[#458588] focus:border-[#458588] resize-none text-[#ebdbb2] placeholder:text-[#928374] transition-colors"
                rows={2}
              />
              <button
                onClick={handleExecuteGoal}
                disabled={!goal.trim() || !isConnected || isExecuting}
                className="px-4 py-2 bg-[#458588] text-white rounded-lg hover:bg-[#83a598] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2 shadow-lg"
              >
                {isExecuting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Execute</span>
              </button>
            </div>
          </div>

          {/* Connection Help */}
          {!isConnected && (
            <div className="p-4 bg-[#fb4934]/10 border border-[#cc241d] rounded-lg">
              <h4 className="text-sm font-medium text-[#fb4934] mb-2">Backend Not Available</h4>
              <p className="text-sm text-[#a89984] mb-2">
                The backend service is not connected. To enable execution:
              </p>
              <ol className="text-sm text-[#a89984] space-y-1 list-decimal list-inside">
                <li>
                  Start the Terminus backend:
                  {" "}
                  <code className="bg-[#3c3836] px-1 rounded text-[#83a598]">
                    uvicorn agent_core.main:build_asgi --factory --reload --host 0.0.0.0 --port 8000
                  </code>
                </li>
                <li>
                  Ensure it&apos;s running on {" "}
                  <code className="bg-[#3c3836] px-1 rounded text-[#83a598]">{serverUrl}</code>
                </li>
                <li>The page will automatically reconnect</li>
              </ol>
            </div>
          )}
        </motion.div>

        {/* Planning Loading State */}
        {isPlanning && steps.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-[#3c3836] rounded-xl border border-[#458588] p-8 shadow-2xl mb-8"
          >
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 text-[#458588] animate-spin" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-[#ebdbb2]">Planning Your Workflow</h3>
                <p className="text-sm text-[#a89984] mt-2">Analyzing goal and creating execution steps...</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Orchestration Flow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="space-y-0"
          role="list"
          aria-label="Orchestration workflow steps"
        >
          {visibleSteps.map(({ step, originalIndex }, index) => (
            <div key={step.id}>
              <div
                ref={el => { stepRefs.current[originalIndex] = el; }}
                className="scroll-mt-20"
              >
                <StepCard step={step} index={originalIndex} isVisible={true} />
              </div>

              {/* Arrow connector between steps */}
              {index < visibleSteps.length - 1 && (
                <ArrowDownConnector
                  isVisible={true}
                  delay={(index + 1) * 0.12 + 0.3}
                />
              )}
            </div>
          ))}
        </motion.div>

        {/* Completion Message */}
        {steps.length > 0 && steps.every(s => s.status === "success") && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 p-6 bg-[#3c3836] border border-[#98971a] rounded-xl text-center"
          >
            <div className="text-[#b8bb26] font-semibold mb-2">
              🎉 Orchestration Complete!
            </div>
            <p className="text-[#a89984]">
              All steps in the workflow have been successfully completed.
            </p>
          </motion.div>
        )}

      </div>
    </main>
  );
}
