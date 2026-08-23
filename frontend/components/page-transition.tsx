"use client"

import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ y: 5 }}
        animate={{ y: 0 }}
        exit={{ y: -5 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="h-full w-full flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
