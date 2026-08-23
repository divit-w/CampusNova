"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Cpu, Zap, ShieldCheck, Sparkles } from "lucide-react"

const PHRASES = [
  "CP-SAT is resolving conflicts...",
  "Checking teacher, room, cohort, capacity and availability constraints...",
  "Pruning invalid permutations and eliminating resource overlaps...",
  "Calculating soft preference optimization (gaps & daily spread)...",
  "Finalizing conflict-free schedule...",
]

export function AlgorithmExplainer() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % PHRASES.length)
    }, 2000) // Change phrase every 2.0s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full flex flex-col items-center justify-center p-8 bg-black/5 dark:bg-white/5 rounded-2xl border border-border backdrop-blur-md shadow-lg overflow-hidden relative min-h-[300px]">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 pointer-events-none" />

      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-pulse" />
          <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center relative z-10">
            <Cpu className="h-6 w-6 text-primary animate-pulse" />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Google OR-Tools CP-SAT Solver
          </h3>
          <p className="text-xs text-muted-foreground">Constraint Satisfaction & Optimization Engine</p>
        </div>
      </div>

      <div className="h-16 w-full max-w-lg flex flex-col items-center justify-center text-center relative z-10 px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex items-center gap-2 text-primary font-medium">
              <Zap className="h-4 w-4 fill-primary shrink-0" />
              <span className="text-sm font-semibold">{PHRASES[index]}</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground relative z-10 bg-background/60 px-3 py-1.5 rounded-full border border-border/50">
        <Sparkles className="h-3 w-3 text-amber-500" />
        <span>Guaranteeing zero double-bookings across all cohorts and faculty</span>
      </div>

      {/* Animated Matrix grid lines background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,1) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  )
}
