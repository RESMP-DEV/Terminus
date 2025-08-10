"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, Play, Pause } from "lucide-react";
import { clsx } from "clsx";

export interface PlanStep {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  command?: string;
  output?: string;
  error?: string;
  reasoning?: string;
}

interface PlanDisplayProps {
  steps: PlanStep[];
  isVisible: boolean;
}

export default function PlanDisplay({ steps, isVisible }: PlanDisplayProps) {
  if (!isVisible || steps.length === 0) {
    return null;
  }

  const getStatusIcon = (status: PlanStep["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "running":
        return <Play className="w-4 h-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: PlanStep["status"]) => {
    switch (status) {
      case "completed":
        return "border-green-200 bg-green-50";
      case "failed":
        return "border-red-200 bg-red-50";
      case "running":
        return "border-blue-200 bg-blue-50";
      default:
        return "border-gray-200 bg-gray-50";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6"
    >
      <div className="flex items-center space-x-3 mb-4">
        <div className="flex items-center justify-center w-8 h-8 bg-purple-100 rounded-full">
          <span className="text-purple-600 font-semibold text-sm">AI</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Generated Plan</h3>
          <div className="flex items-center space-x-4">
            <p className="text-gray-600 text-sm">
              {steps.filter(s => s.status === "completed").length} of {steps.length} steps completed
            </p>
            {steps.some(s => s.status === "failed") && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                🔄 Auto-retry in progress
              </span>
            )}
            {steps.every(s => s.status === "completed") && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                ✅ All steps completed
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={clsx(
              "flex items-start space-x-3 p-3 rounded-lg border transition-all duration-200",
              getStatusColor(step.status)
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              {getStatusIcon(step.status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-sm font-medium text-gray-500">
                  Step {index + 1}
                </span>
                {step.status === "running" && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    Executing...
                  </span>
                )}
              </div>

              <p className="text-gray-900 text-sm font-medium mb-2">
                {step.description}
              </p>

              {step.reasoning && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
                  <p className="text-yellow-800 text-xs">
                    <strong>Reasoning:</strong> {step.reasoning}
                  </p>
                </div>
              )}

              {step.command && (
                <div className="bg-gray-900 rounded p-2 mb-2">
                  <code className="text-green-400 text-xs font-mono">
                    $ {step.command}
                  </code>
                </div>
              )}

              {step.output && (
                <div className="bg-gray-100 rounded p-2 mb-2">
                  <pre className="text-gray-700 text-xs whitespace-pre-wrap">
                    {step.output}
                  </pre>
                </div>
              )}

              {step.error && (
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <div className="flex items-center space-x-2 mb-1">
                    <XCircle className="w-3 h-3 text-red-600" />
                    <span className="text-red-800 text-xs font-semibold">Error</span>
                  </div>
                  <p className="text-red-700 text-xs mb-2">
                    {step.error}
                  </p>
                  {step.error.includes("re-planning") && (
                    <div className="bg-yellow-100 border border-yellow-300 rounded px-2 py-1">
                      <p className="text-yellow-800 text-xs">
                        🔄 AI is generating a new approach...
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
          <span>Progress</span>
          <span>
            {steps.filter(s => s.status === "completed").length}/{steps.length}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <motion.div
            className="bg-blue-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{
              width: `${(steps.filter(s => s.status === "completed").length / steps.length) * 100}%`
            }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
    </motion.div>
  );
}
