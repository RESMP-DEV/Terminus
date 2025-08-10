"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import StepCard from "@/components/StepCard";
import ArrowDownConnector from "@/components/ArrowDown";
import SystemMetricsPanel from "@/components/SystemMetrics";
import PlanDisplay, { PlanStep } from "@/components/PlanDisplay";
import { OrchestrationEngine } from "@/lib/orchestration";
import { OrchestrationStep } from "@/lib/types";
import { RotateCcw, Wifi, WifiOff, Send, Loader2, Link as LinkIcon } from "lucide-react";

export default function Home() {
  const [steps, setSteps] = useState<OrchestrationStep[]>([]);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [engine] = useState(() => new OrchestrationEngine());
  const [isConnected, setIsConnected] = useState(false);
  const [goal, setGoal] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>(process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000");
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Initialize once on mount
  useEffect(() => {
    console.log("[React] Component mounted, setting up subscriptions");

    // Apply localStorage override only on client
    try {
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem("terminus.backendUrl");
        if (saved) setServerUrl(saved);
      }
    } catch {}

    const unsubscribe = engine.subscribe((newSteps) => {
      console.log("[React] Received step update:", newSteps.map(s => `${s.id}:${s.status}`).join(" | "));
      console.log("[React] New steps array:", newSteps);

      // Force complete re-render with new array
      setSteps(newSteps.map(step => ({ ...step })));

      // Update execution state based on steps
      const hasActiveSteps = newSteps.some(s => s.status === "active");
      const allCompleted = newSteps.every(s => s.status === "completed" || s.status === "pending");
      setIsExecuting(hasActiveSteps && !allCompleted);
    });

    setSteps(engine.getSteps());

    // Subscribe to connection status changes
    const unsubscribeConnection = engine.subscribeConnection(setIsConnected);

    // Subscribe to plan updates
    const unsubscribePlan = engine.subscribePlan((newPlanSteps) => {
      console.log("[React] Received plan update:", newPlanSteps.map(s => `${s.id}:${s.status}`).join(" | "));
      setPlanSteps([...newPlanSteps]);
    });

    return () => {
      console.log("[React] Component unmounting, cleaning up subscriptions");
      unsubscribe();
      unsubscribeConnection();
      unsubscribePlan();
      engine.destroy();
    };
  }, []); // Empty dependency array - only run once on mount

  // Handle server URL changes separately
  useEffect(() => {
    console.log("[React] Server URL changed to:", serverUrl);
    engine.connect(serverUrl);
  }, [engine, serverUrl]);

  const handleExecuteGoal = () => {
    if (goal.trim() && isConnected) {
      setGoal(goal.trim());
      engine.executeGoal(goal.trim(), serverUrl);
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

  const getStepVisibility = () => true;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Terminus</h1>
              <p className="text-gray-600">Agent Orchestration Platform</p>
            </div>
            <div className="flex items-center space-x-3">
              {isConnected ? (
                <div className="flex items-center space-x-2 text-green-600">
                  <Wifi className="w-4 h-4" />
                  <span className="text-sm">Connected</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-red-600">
                  <WifiOff className="w-4 h-4" />
                  <span className="text-sm">Disconnected</span>
                </div>
              )}
              <button
                onClick={handleReset}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* System Metrics */}
        <div className="mb-8">
          <SystemMetricsPanel metrics={engine.getMetrics()} />
        </div>

        {/* Plan Display */}
        <PlanDisplay
          steps={planSteps}
          isVisible={planSteps.length > 0}
        />

        {/* Goal Input Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-8"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Execute Agent Goal</h3>

          {/* Backend URL Configuration */}
          <div className="mb-4">
            <label htmlFor="backend-url" className="block text-sm font-medium text-gray-700 mb-2">
              Backend Server URL
            </label>
            <div className="flex space-x-2">
              <input
                id="backend-url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:8000"
                className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
              />
              <button
                onClick={handleApplyServerUrl}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center space-x-2"
              >
                <LinkIcon className="w-4 h-4" />
                <span>Apply</span>
              </button>
            </div>
          </div>

          {/* Goal Input */}
          <div className="mb-4">
            <label htmlFor="goal" className="block text-sm font-medium text-gray-700 mb-2">
              Enter a goal for the agent to execute:
            </label>
            <div className="flex space-x-2">
              <textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Create a README.md file for this project"
                className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900 placeholder:text-gray-500"
                rows={2}
              />
              <button
                onClick={handleExecuteGoal}
                disabled={!goal.trim() || !isConnected || isExecuting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
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
            <div className="p-4 bg-gray-50 rounded-md">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Backend Not Available</h4>
              <p className="text-sm text-gray-600 mb-2">
                The backend service is not connected. To enable execution:
              </p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>
                  Start the Terminus backend:
                  {" "}
                  <code className="bg-gray-200 px-1 rounded">
                    uvicorn agent_core.main:build_asgi --factory --reload --host 0.0.0.0 --port 8000
                  </code>
                </li>
                <li>
                  Ensure it&apos;s running on {" "}
                  <code className="bg-gray-200 px-1 rounded">{serverUrl}</code>
                </li>
                <li>The page will automatically reconnect</li>
              </ol>
            </div>
          )}
        </motion.div>

        {/* Orchestration Flow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="space-y-0"
          role="list"
          aria-label="Orchestration workflow steps"
        >
          {steps.map((step, index) => {
            console.log(`[React] Rendering step ${step.id} with status ${step.status}`);
            return (
              <div key={`${step.id}-${step.status}-${index}`}>
                <div
                  ref={el => { stepRefs.current[index] = el; }}
                  className="scroll-mt-20"
                >
                  <StepCard
                    step={step}
                    index={index}
                    isVisible={getStepVisibility()}
                  />
                </div>

                {/* Arrow connector between steps */}
                {index < steps.length - 1 && (
                  <ArrowDownConnector
                    isVisible={getStepVisibility()}
                    delay={(index + 1) * 0.12 + 0.3}
                  />
                )}
              </div>
            );
          })}
        </motion.div>

        {/* Completion Message */}
        {steps.every(s => s.status === "completed") && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 p-6 bg-green-50 border border-green-200 rounded-lg text-center"
          >
            <div className="text-green-800 font-semibold mb-2">
              🎉 Orchestration Complete!
            </div>
            <p className="text-green-700">
              All steps in the workflow have been successfully completed.
            </p>
          </motion.div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-gray-500">
          <p>Built with Next.js, Tailwind CSS, and Framer Motion</p>
          <div className="mt-2 flex items-center justify-center space-x-4 text-sm">
            <span>Goal Input → AI Planner → Step Executor → Secure Sandbox → System Monitor</span>
          </div>
        </div>
      </div>
    </main>
  );
}
