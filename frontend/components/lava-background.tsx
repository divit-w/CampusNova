"use client"

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/**
 * Ambient "lava" mesh — a slow-breathing aurora of heavily blurred color
 * fields sitting behind the entire app shell. Purely decorative (aria-hidden,
 * pointer-events-none, fixed so it never affects scroll/layout). Every
 * foreground surface (sidebar, header, cards) uses `.glass-surface` /
 * `.glass` to sit on top of it with real frosted-glass separation.
 *
 * Kept intentionally slow (24-34s loops) and low-opacity so it reads as
 * ambient light, not a distracting screensaver. Respects
 * prefers-reduced-motion by freezing the blobs in place.
 */
interface Blob {
  className: string
  animate: { x: number[]; y: number[]; scale: number[] }
  duration: number
}

const BLOBS: Blob[] = [
  {
    className: "left-[-14%] top-[-18%] h-[620px] w-[620px] bg-[#1D4ED8]/45",
    animate: { x: [0, 70, -30, 0], y: [0, 50, -25, 0], scale: [1, 1.08, 0.95, 1] },
    duration: 26,
  },
  {
    className: "right-[-16%] top-[-8%] h-[560px] w-[560px] bg-[#06B6D4]/40",
    animate: { x: [0, -60, 35, 0], y: [0, 55, -30, 0], scale: [1, 0.94, 1.07, 1] },
    duration: 31,
  },
  {
    className: "bottom-[-20%] left-[12%] h-[540px] w-[540px] bg-[#7C3AED]/22",
    animate: { x: [0, 45, -45, 0], y: [0, -35, 20, 0], scale: [1, 1.06, 0.96, 1] },
    duration: 34,
  },
  {
    className: "bottom-[-16%] right-[8%] h-[460px] w-[460px] bg-slate-400/18",
    animate: { x: [0, -35, 25, 0], y: [0, 25, -30, 0], scale: [1, 0.96, 1.05, 1] },
    duration: 22,
  },
]

export function LavaBackground() {
  const reduceMotion = useReducedMotion()

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-surface">
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full blur-[120px] will-change-transform", blob.className)}
          animate={reduceMotion ? undefined : blob.animate}
          transition={
            reduceMotion
              ? undefined
              : { duration: blob.duration, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
          }
        />
      ))}
    </div>
  )
}
