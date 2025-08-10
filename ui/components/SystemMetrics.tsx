"use client";

import { motion } from "framer-motion";
import { SystemMetrics } from "@/lib/types";
import { Activity, Users, Clock, TrendingUp } from "lucide-react";

interface SystemMetricsProps {
  metrics: SystemMetrics;
}

export default function SystemMetricsPanel({ metrics }: SystemMetricsProps) {
  const metricItems = [
    {
      label: "Tasks Completed",
      value: (metrics.tasksCompleted ?? 0).toLocaleString(),
      icon: TrendingUp,
      color: "text-green-500"
    },
    {
      label: "Success Rate",
      value: `${(metrics.successRate ?? 0).toFixed(1)}%`,
      icon: Activity,
      color: "text-blue-500"
    },
    {
      label: "Avg Response Time",
      value: `${metrics.avgResponseTime ?? 0}ms`,
      icon: Clock,
      color: "text-yellow-500"
    },
    {
      label: "Active Agents",
      value: (metrics.activeAgents ?? 0).toString(),
      icon: Users,
      color: "text-purple-500"
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">System Metrics</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metricItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            className="text-center p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center justify-center mb-2">
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {item.value}
            </div>
            <div className="text-sm text-gray-500">
              {item.label}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Queue Depth:</span>
          <span className="font-medium text-gray-900">{metrics.queueDepth ?? 0} pending</span>
        </div>
      </div>
    </motion.div>
  );
}
