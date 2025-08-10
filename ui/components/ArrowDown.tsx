"use client";

import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

interface ArrowDownProps {
  isVisible: boolean;
  delay?: number;
}

export default function ArrowDownConnector({ isVisible, delay = 0 }: ArrowDownProps) {
  if (!isVisible) {
    return <div className="h-8" />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
        delay: delay
      }}
      className="flex justify-center py-4"
    >
      <div className="relative">
        {/* Animated pulse ring */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 w-10 h-10 bg-blue-200 rounded-full"
        />

        {/* Arrow container */}
        <div className="relative w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
          <motion.div
            animate={{
              y: [0, 2, 0]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <ArrowDown className="w-5 h-5 text-white" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
