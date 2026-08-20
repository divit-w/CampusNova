import type { Transition, Variants } from "framer-motion"

/**
 * Shared motion system — every layout shift in the app uses these springs so
 * transitions feel consistent (iOS / Telegram fluidity). Keep in sync with the
 * --ease-spring / --ease-out-soft CSS tokens in globals.css.
 */

/** The base spring also carries a softer `.gentle` variant for lower-stakes transitions (e.g. result panels, example prompts). */
type SpringTransition = Transition & { gentle: Transition }

export const spring: SpringTransition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.9,
  gentle: {
    type: "spring",
    stiffness: 260,
    damping: 30,
  },
}

export const softSpring: Transition = spring.gentle

export const easeOutSoft: Transition = {
  duration: 0.34,
  ease: [0.16, 1, 0.3, 1],
}

/** Container that staggers its children on entrance. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
}

/** Standard "rise + fade" item used across cards, rows and grids. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring },
}

export const fadeItem: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: easeOutSoft },
}

/** Aliases used by list-style layouts (result tables, schedule grids) — same stagger/rise system. */
export const listContainer = staggerContainer
export const listItem = riseItem
