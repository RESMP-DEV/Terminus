"use client";

import { motion } from "framer-motion";
import { OrchestrationStep } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  BarChart3
} from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";

interface StepCardProps {
  step: OrchestrationStep;
  index: number;
  isVisible: boolean;
}

export default function StepCard({
  step,
  index,
  isVisible
}: StepCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  console.log(`[StepCard] ${step.id}: status=${step.status}, visible=${isVisible}`, { logs: step.logs, metrics: step.metrics });

  const getStatusIcon = () => {
    switch (step.status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "active":
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      case "blocked":
        return <AlertCircle className="w-5 h-5 text-yellow-500 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = () => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (step.status) {
      case "completed":
        return `${baseClasses} bg-green-100 text-green-700`;
      case "failed":
        return `${baseClasses} bg-red-100 text-red-700`;
      case "active":
        return `${baseClasses} bg-blue-100 text-blue-700`;
      case "blocked":
        return `${baseClasses} bg-yellow-100 text-yellow-700`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-500`;
    }
  };

  const hasDetails = step.logs && step.logs.length > 0 || step.metrics && Object.keys(step.metrics).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 22,
        delay: index * 0.12
      }}
      className={clsx(
        "border rounded-lg p-6 bg-white shadow-sm transition-all duration-200",
        {
          "border-blue-500 shadow-blue-100": step.status === "active",
          "border-green-500 shadow-green-100": step.status === "completed",
          "border-red-500 shadow-red-100": step.status === "failed",
          "border-yellow-500 shadow-yellow-100": step.status === "blocked",
          "border-gray-200": step.status === "pending"
        }
      )}
      role="listitem"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <div className="flex-shrink-0 mt-1">
            {getStatusIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Step {index + 1}</h3>
              <div className="flex items-center space-x-2">
                <span className={getStatusBadge()}>
                  {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                </span>
                {hasDetails && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 transition-colors p-1 rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Step Description */}
            <p className="text-gray-600">{step.description}</p>
          </div>
        </div>
      </div>

      {/* Status indicators */}
      {step.status === "active" && (
        <div className="mt-4 flex items-center space-x-2 text-blue-600 text-sm">
          <Activity className="w-4 h-4 animate-pulse" />
          <span>Executing...</span>
        </div>
      )}

      {step.status === "blocked" && (
        <div className="mt-4 flex items-center space-x-2 text-yellow-600 text-sm">
          <AlertCircle className="w-4 h-4 animate-pulse" />
          <span>Blocked due to error...</span>
        </div>
      )}

      {/* Expanded Details */}
      {hasDetails && isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-4 border-t border-gray-200 pt-4 space-y-4"
        >
          {/* Command/Metrics Section */}
          {step.metrics && Object.keys(step.metrics).length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <span className="font-medium text-gray-700">Metrics</span>
              </div>
              <div className="bg-gray-50 rounded p-3 space-y-1">
                {Object.entries(step.metrics).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-600">{key}:</span>
                    <span className="text-gray-800 font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs Section */}
          {step.logs && step.logs.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Terminal className="w-4 h-4 text-gray-500" />
                <span className="font-medium text-gray-700">Execution Details</span>
              </div>
              <div className="bg-gray-900 rounded p-3 max-h-64 overflow-y-auto">
                {step.logs.map((log, index) => {
                  const isCommand = log.startsWith("Command:");
                  const isError = log.toLowerCase().includes("error") || log.toLowerCase().includes("failed");
                  const isSuccess = log.toLowerCase().includes("success") || log.toLowerCase().includes("completed");

                  return (
                    <div
                      key={index}
                      className={`text-sm font-mono whitespace-pre-wrap mb-1 ${
                        isCommand
                          ? "text-cyan-400 font-bold"
                          : isError
                            ? "text-red-400"
                            : isSuccess
                              ? "text-green-400"
                              : "text-gray-300"
                      }`}
                    >
                      {isCommand && "$ "}
                      {isCommand ? log.replace("Command: ", "") : log}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Results Summary */}
          {step.status === "completed" && step.metrics && (
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="font-medium text-green-800">Execution Summary</span>
              </div>
              {step.metrics["Exit Code"] === 0 && (
                <p className="text-green-700 text-sm">
                  ✅ Command executed successfully
                  {step.metrics["Output Lines"] && ` (${step.metrics["Output Lines"]} lines of output)`}
                </p>
              )}
            </div>
          )}

          {step.status === "failed" && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <div className="flex items-center space-x-2 mb-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="font-medium text-red-800">Execution Failed</span>
              </div>
              <p className="text-red-700 text-sm">
                ❌ Command failed
                {step.metrics && step.metrics["Exit Code"] && ` (Exit code: ${step.metrics["Exit Code"]})`}
              </p>
              <p className="text-red-600 text-xs mt-1">
                Check logs above for detailed error information
              </p>
            </div>
          )}

          {/* Artifacts Section */}
          {step.artifacts && step.artifacts.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="font-medium text-gray-700">Artifacts</span>
              </div>
              <div className="space-y-2">
                {step.artifacts.map((artifact, index) => (
                  <div key={index} className="bg-blue-50 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-blue-900">{artifact.name}</span>
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        {artifact.type}
                      </span>
                    </div>
                    <pre className="text-sm text-blue-800 whitespace-pre-wrap bg-white p-2 rounded border">
                      {artifact.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
