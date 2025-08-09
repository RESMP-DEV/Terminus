"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import StepCard from "@/components/StepCard";
import ArrowDownConnector from "@/components/ArrowDown";
import SystemMetricsPanel from "@/components/SystemMetrics";
import LiveDemo from "@/components/LiveDemo";
import { OrchestrationEngine } from "@/lib/orchestration";
import { OrchestrationStep } from "@/lib/types";
import { Play, RotateCcw } from "lucide-react";

export default function Home() {
  const [steps, setSteps] = useState<OrchestrationStep[]>([]);
  const [engine] = useState(() => new OrchestrationEngine());
  const [isRunning, setIsRunning] = useState(false);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setSteps);
    setSteps(engine.getSteps());
    return unsubscribe;
  }, [engine]);

  const handleAdvanceStep = (stepId: OrchestrationStep["id"]) => {
    engine.advanceStep(stepId);
    
    // Scroll to next step
    const currentIndex = steps.findIndex(s => s.id === stepId);
    const nextIndex = currentIndex + 1;
    if (nextIndex < stepRefs.current.length && stepRefs.current[nextIndex]) {
      stepRefs.current[nextIndex]?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  };

  const handleRetryStep = (stepId: OrchestrationStep["id"]) => {
    engine.retryStep(stepId);
  };

  const handleStartDemo = () => {
    setIsRunning(true);
    // Auto-advance through steps for demo
    const activeStep = steps.find(s => s.status === "active");
    if (activeStep) {
      setTimeout(() => {
        engine.advanceStep(activeStep.id);
        setIsRunning(false);
      }, 2000);
    }
  };

  const handleReset = () => {
    engine.reset();
    setIsRunning(false);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getStepVisibility = (index: number) => {
    if (index === 0) return true;
    const prevStep = steps[index - 1];
    return prevStep?.status === "completed" || prevStep?.status === "active";
  };

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
              <button
                onClick={handleStartDemo}
                disabled={isRunning}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-4 h-4" />
                <span>{isRunning ? "Running..." : "Start Demo"}</span>
              </button>
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

        {/* Live Demo */}
        <div className="mb-8">
          <LiveDemo />
        </div>

        {/* Orchestration Flow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="space-y-0"
          role="list"
          aria-label="Orchestration workflow steps"
        >
          {steps.map((step, index) => (
            <div key={step.id}>
              <div
                ref={el => { stepRefs.current[index] = el; }}
                className="scroll-mt-20"
              >
                <StepCard
                  step={step}
                  index={index}
                  isVisible={getStepVisibility(index)}
                  onAdvance={handleAdvanceStep}
                  onRetry={handleRetryStep}
                />
              </div>
              
              {/* Arrow connector between steps */}
              {index < steps.length - 1 && (
                <ArrowDownConnector
                  isVisible={getStepVisibility(index + 1)}
                  delay={(index + 1) * 0.12 + 0.3}
                />
              )}
            </div>
          ))}
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
            <span>Task Queue → Agent Executor → Secure Sandbox → System Monitor</span>
          </div>
        </div>
      </div>
    </main>
  );
}
