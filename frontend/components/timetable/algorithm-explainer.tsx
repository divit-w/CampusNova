"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Cpu, Zap } from "lucide-react"

const PHRASES = [
  "Solving NP-Hard Resource Allocation...",
  "Pruning Invalid Permutations & Faculty Clashes...",
  "Enforcing 100% Hard Boundaries (Room locks, Blocked periods)...",
  "Calculating Soft Preference Optimization (Maximizing Teacher Satisfaction)...",
]

export function AlgorithmExplainer() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % PHRASES.length)
    }, 2500) // Change phrase every 2.5s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full flex flex-col items-center justify-center p-8 bg-black/5 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-md animate-pulse" />
          <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center relative z-10">
            <Cpu className="h-6 w-6 text-primary animate-pulse" />
          </div>
        </div>
        <h3 className="text-xl font-semibold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          AI Optimization Engine
        </h3>
      </div>

      <div className="h-20 w-full max-w-md flex flex-col items-center justify-center text-center relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex items-center gap-2 text-primary">
              <Zap className="h-4 w-4 fill-primary" />
              <span className="text-sm font-medium">{PHRASES[index]}</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Animated Matrix grid lines background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
        style={{
          backgroundImage: "linear-gradient(rgba(0,0,0,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,1) 1px, transparent 1px)",
          backgroundSize: "20px 20px"
        }}
      />
    </div>
  )
}
