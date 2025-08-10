"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { socketClient } from "@/lib/socket-client";
import { Wifi, WifiOff, Send, Loader2, Link as LinkIcon } from "lucide-react";

export default function LiveDemo() {
  const [isConnected, setIsConnected] = useState(false);
  const [goal, setGoal] = useState("");
  const [currentPlan, setCurrentPlan] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState("");
  const [lastResult, setLastResult] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState("");
  const [serverUrl, setServerUrl] = useState<string>(
    typeof window !== "undefined"
      ? window.localStorage.getItem("terminus.backendUrl") || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
      : process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
  );

  useEffect(() => {
    // Try to connect to backend
    socketClient.connect(serverUrl);

    const unsubscribes = [
      socketClient.on("plan_generated", (payload) => {
        setCurrentPlan(payload.plan);
        setIsExecuting(true);
      }),

      socketClient.on("step_executing", (payload) => {
        setCurrentStep(payload.step);
        setError("");
      }),

      socketClient.on("step_result", (payload) => {
        setLastResult(`Exit Code: ${payload.exit_code}\nStdout: ${payload.stdout}\nStderr: ${payload.stderr}`);
      }),

      socketClient.on("error_detected", (payload) => {
        setError(`Error in ${payload.failed_step}: ${payload.error}`);
      }),

      socketClient.on("workflow_complete", (payload) => {
        setIsExecuting(false);
        setCurrentStep("Complete");
        setLastResult(`Workflow completed with status: ${payload.status}`);
      }),

      socketClient.on("re_planning", () => {
        setCurrentStep("Re-planning...");
        setCurrentPlan([]);
      })
    ];

    // Check connection status
    const checkConnection = () => {
      setIsConnected(socketClient.isConnected());
    };

    const interval = setInterval(checkConnection, 1000);
    checkConnection();

    return () => {
      clearInterval(interval);
      unsubscribes.forEach(unsub => unsub());
    };
  }, [serverUrl]);

  const handleExecuteGoal = () => {
    if (goal.trim() && isConnected) {
      setCurrentPlan([]);
      setCurrentStep("");
      setLastResult("");
      setError("");
      setIsExecuting(true);

      socketClient.executeGoal(goal.trim());
    }
  };

  const handleApplyServerUrl = () => {
    const url = serverUrl.trim();
    if (!url) return;
    try {
      // lightweight validation
      const u = new URL(url);
      window.localStorage.setItem("terminus.backendUrl", u.toString());
      // reconnect with new URL
      socketClient.connect(u.toString());
    } catch {
      // ignore invalid URL; a real app could surface a toast
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleExecuteGoal();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm text-gray-900"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Live Backend Integration</h3>
        <div className="flex items-center space-x-2">
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
        </div>
      </div>

      {/* Backend URL input */}
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
      <div className="mb-6">
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

      {/* Status Display */}
      <div className="space-y-4">
        {/* Current Plan */}
        {currentPlan.length > 0 && (
          <div className="p-4 bg-blue-50 rounded-md">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Generated Plan:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              {currentPlan.map((step, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="font-mono text-xs bg-blue-200 px-2 py-1 rounded">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Current Step */}
        {currentStep && (
          <div className="p-4 bg-yellow-50 rounded-md">
            <h4 className="text-sm font-medium text-yellow-900 mb-2">Current Step:</h4>
            <p className="text-sm text-yellow-800">{currentStep}</p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 rounded-md">
            <h4 className="text-sm font-medium text-red-900 mb-2">Error:</h4>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Last Result */}
        {lastResult && (
          <div className="p-4 bg-gray-50 rounded-md">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Last Result:</h4>
            <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded overflow-auto">
              {lastResult}
            </pre>
          </div>
        )}
      </div>

      {/* Connection Help */}
      {!isConnected && (
        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Backend Not Available</h4>
          <p className="text-sm text-gray-600 mb-2">
            The live backend integration is not connected. To enable real-time functionality:
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
            <li>Refresh this page to reconnect</li>
          </ol>
        </div>
      )}
    </motion.div>
  );
}
