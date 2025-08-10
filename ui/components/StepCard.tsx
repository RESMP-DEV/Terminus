"use client";

import { motion } from "framer-motion";
import { OrchestrationStep } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Terminal,
  AlertCircle
} from "lucide-react";
import { clsx } from "clsx";

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
  console.log(`[StepCard] ${step.id}: status=${step.status}, visible=${isVisible}`);

  const getStatusIcon = () => {
    switch (step.status) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "executing":
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      case "re-planning":
        return <AlertCircle className="w-5 h-5 text-yellow-500 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = () => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (step.status) {
      case "success":
        return `${baseClasses} bg-green-100 text-green-700`;
      case "failed":
        return `${baseClasses} bg-red-100 text-red-700`;
      case "executing":
        return `${baseClasses} bg-blue-100 text-blue-700`;
      case "re-planning":
        return `${baseClasses} bg-yellow-100 text-yellow-700`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-500`;
    }
  };

  // Remove the waiting state - show all steps immediately
  // if (!isVisible) {
  //   return (
  //     <div className="h-32 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
  //       <div className="text-gray-400 text-sm">Waiting for previous step...</div>
  //     </div>
  //   );
  // }

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
          "border-blue-500 shadow-blue-100": step.status === "executing",
          "border-green-500 shadow-green-100": step.status === "success",
          "border-red-500 shadow-red-100": step.status === "failed",
          "border-yellow-500 shadow-yellow-100": step.status === "re-planning",
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
              <span className={getStatusBadge()}>
                {step.status === "re-planning" ? "Re-planning" : 
                 step.status.charAt(0).toUpperCase() + step.status.slice(1)}
              </span>
            </div>
            
            {/* Step Description */}
            <p className="text-gray-600">{step.description}</p>

            {/* Command */}
            {step.command && (
              <div className="mt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Terminal className="w-4 h-4 text-gray-500" />
                  <h4 className="text-sm font-medium text-gray-700">Command:</h4>
                </div>
                <div className="bg-gray-900 text-gray-100 p-3 rounded overflow-hidden">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    <code>{step.command}</code>
                  </pre>
                </div>
              </div>
            )}

            {/* Output */}
            {step.output && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Output:</h4>
                <div className="bg-green-50 border border-green-200 p-3 rounded overflow-hidden max-h-40 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800">
                    {step.output}
                  </pre>
                </div>
              </div>
            )}

            {/* Error */}
            {step.error && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-red-700 mb-2">Error:</h4>
                <div className="bg-red-50 border border-red-200 p-3 rounded overflow-hidden max-h-40 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-red-800">
                    {step.error}
                  </pre>
                </div>
              </div>
            )}

            {/* Exit Code */}
            {step.exitCode !== undefined && step.exitCode !== 0 && (
              <div className="mt-2">
                <span className="text-xs text-red-600">Exit code: {step.exitCode}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status indicators */}
      {step.status === "executing" && (
        <div className="mt-4 flex items-center space-x-2 text-blue-600 text-sm">
          <Activity className="w-4 h-4 animate-pulse" />
          <span>Executing command...</span>
        </div>
      )}

      {step.status === "re-planning" && (
        <div className="mt-4 flex items-center space-x-2 text-yellow-600 text-sm">
          <AlertCircle className="w-4 h-4 animate-pulse" />
          <span>Re-planning due to error...</span>
        </div>
      )}
    </motion.div>
  );
}