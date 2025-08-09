"use client";

import { motion } from "framer-motion";
import { OrchestrationStep } from "@/lib/types";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Play, 
  ChevronDown, 
  ChevronRight,
  RotateCcw,
  Activity
} from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";

interface StepCardProps {
  step: OrchestrationStep;
  index: number;
  isVisible: boolean;
  onAdvance?: (stepId: OrchestrationStep["id"]) => void;
  onRetry?: (stepId: OrchestrationStep["id"]) => void;
}

export default function StepCard({ 
  step, 
  index, 
  isVisible, 
  onAdvance, 
  onRetry 
}: StepCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getStatusIcon = () => {
    switch (step.status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "active":
      case "executing":
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
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
      case "executing":
        return `${baseClasses} bg-yellow-100 text-yellow-700`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-500`;
    }
  };

  const canAdvance = step.status === "active" && step.passCriteria.length > 0;
  const canRetry = step.status === "failed";

  if (!isVisible) {
    return (
      <div className="h-32 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Waiting for previous step...</div>
      </div>
    );
  }

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
          "border-gray-200": step.status === "pending" || step.status === "blocked"
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
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
              <span className={getStatusBadge()}>
                {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
              </span>
            </div>
            <p className="text-gray-600 mt-1">{step.description}</p>

            {/* Pass Criteria */}
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Requirements:</h4>
              <ul className="space-y-1">
                {step.passCriteria.map((criteria, idx) => (
                  <li key={idx} className="flex items-center space-x-2 text-sm">
                    <CheckCircle2 
                      className={clsx("w-4 h-4", {
                        "text-green-500": step.status === "completed",
                        "text-blue-500": step.status === "active" || step.status === "executing",
                        "text-gray-300": step.status === "pending" || step.status === "blocked"
                      })} 
                    />
                    <span className="text-gray-600">{criteria}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Metrics */}
            {step.metrics && Object.keys(step.metrics).length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-4">
                {Object.entries(step.metrics).map(([key, value]) => (
                  <div key={key} className="text-center p-2 bg-gray-50 rounded">
                    <div className="text-sm font-medium text-gray-900">{value}</div>
                    <div className="text-xs text-gray-500">{key}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          aria-expanded={showDetails}
          aria-controls={`details-${step.id}`}
        >
          {showDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span>Details</span>
        </button>

        <div className="flex space-x-2">
          {canRetry && onRetry && (
            <button
              onClick={() => onRetry(step.id)}
              className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          )}
          
          {canAdvance && onAdvance && (
            <button
              onClick={() => onAdvance(step.id)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              <Play className="w-4 h-4" />
              <span>Continue</span>
            </button>
          )}
        </div>
      </div>

      {/* Details Section */}
      {showDetails && (
        <motion.div
          id={`details-${step.id}`}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-gray-200"
        >
          {step.logs && step.logs.length > 0 && (
            <div className="mb-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Recent Logs:</h5>
              <div className="bg-gray-900 text-green-400 p-3 rounded text-sm font-mono max-h-32 overflow-y-auto">
                {step.logs.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            </div>
          )}
          
          {step.artifacts && step.artifacts.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Artifacts:</h5>
              <div className="space-y-1">
                {step.artifacts.map((artifact, idx) => (
                  <div key={idx} className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    {JSON.stringify(artifact, null, 2)}
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