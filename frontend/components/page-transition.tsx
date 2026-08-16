"use client"

import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="h-full w-full flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
