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
        return <CheckCircle2 className="w-5 h-5 text-[#98971a]" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-[#cc241d]" />;
      case "executing":
        return <Activity className="w-5 h-5 text-[#458588] animate-pulse" />;
      case "re-planning":
        return <AlertCircle className="w-5 h-5 text-[#d79921] animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-[#928374]" />;
    }
  };

  const getStatusBadge = () => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (step.status) {
      case "success":
        return `${baseClasses} bg-[#98971a]/20 text-[#98971a] border border-[#98971a]/50`;
      case "failed":
        return `${baseClasses} bg-[#cc241d]/20 text-[#cc241d] border border-[#cc241d]/50`;
      case "executing":
        return `${baseClasses} bg-[#458588]/20 text-[#458588] border border-[#458588]/50`;
      case "re-planning":
        return `${baseClasses} bg-[#d79921]/20 text-[#d79921] border border-[#d79921]/50`;
      default:
        return `${baseClasses} bg-[#928374]/20 text-[#928374] border border-[#928374]/50`;
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
        "border rounded-xl p-6 bg-[#3c3836] shadow-xl transition-all duration-200",
        {
          "border-[#458588] shadow-[#458588]/20": step.status === "executing",
          "border-[#98971a] shadow-[#98971a]/20": step.status === "success",
          "border-[#cc241d] shadow-[#cc241d]/20": step.status === "failed",
          "border-[#d79921] shadow-[#d79921]/20": step.status === "re-planning",
          "border-[#504945]": step.status === "pending"
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
              <h3 className="text-lg font-semibold text-[#ebdbb2]">Step {index + 1}</h3>
              <span className={getStatusBadge()}>
                {step.status === "re-planning" ? "Re-planning" : 
                 step.status.charAt(0).toUpperCase() + step.status.slice(1)}
              </span>
            </div>
            
            {/* Step Description */}
            <p className="text-[#a89984]">{step.description}</p>

            {/* Command */}
            {step.command && (
              <div className="mt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Terminal className="w-4 h-4 text-[#928374]" />
                  <h4 className="text-sm font-medium text-[#a89984]">Command:</h4>
                </div>
                <div className="bg-[#282828] text-[#ebdbb2] p-3 rounded-lg overflow-hidden border border-[#3c3836]">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    <code>{step.command}</code>
                  </pre>
                </div>
              </div>
            )}

            {/* Output */}
            {step.output && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-[#a89984] mb-2">Output:</h4>
                <div className="bg-[#282828] border border-[#98971a]/50 p-3 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-[#b8bb26]">
                    {step.output}
                  </pre>
                </div>
              </div>
            )}

            {/* Error */}
            {step.error && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-[#fb4934] mb-2">Error:</h4>
                <div className="bg-[#282828] border border-[#cc241d]/50 p-3 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-[#fb4934]">
                    {step.error}
                  </pre>
                </div>
              </div>
            )}

            {/* Exit Code */}
            {step.exitCode !== undefined && step.exitCode !== 0 && (
              <div className="mt-2">
                <span className="text-xs text-[#fb4934]">Exit code: {step.exitCode}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status indicators */}
      {step.status === "executing" && (
        <div className="mt-4 flex items-center space-x-2 text-[#458588] text-sm">
          <Activity className="w-4 h-4 animate-pulse" />
          <span className="flex items-center">
            Executing command
            <motion.span
              className="inline-flex ml-1"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="mx-0.5">.</span>
            </motion.span>
            <motion.span
              className="inline-flex"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
            >
              <span className="mx-0.5">.</span>
            </motion.span>
            <motion.span
              className="inline-flex"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            >
              <span className="mx-0.5">.</span>
            </motion.span>
          </span>
        </div>
      )}

      {step.status === "re-planning" && (
        <div className="mt-4 flex items-center space-x-2 text-[#d79921] text-sm">
          <AlertCircle className="w-4 h-4 animate-pulse" />
          <span>Re-planning due to error...</span>
        </div>
      )}
    </motion.div>
  );
}