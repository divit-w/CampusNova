"use client"

import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"

export default function AppLoading() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="flex items-center justify-center rounded-2xl border border-border bg-background/50 p-4 shadow-soft backdrop-blur-sm"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </motion.div>
    </div>
  )
}
