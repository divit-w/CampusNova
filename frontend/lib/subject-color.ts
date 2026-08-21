/**
 * Deterministic subject -> color mapping (audit P1-5).
 *
 * Every subject id always maps to the same palette entry, so the grid is
 * visually stable across renders and re-generations. Palette entries are
 * light-theme tints with matching text/border so cells stay legible.
 */

export interface SubjectColor {
  bg: string
  text: string
  border: string
  dot: string
}

const PALETTE: SubjectColor[] = [
  { bg: "bg-blue-50", text: "text-blue-900", border: "border-blue-200", dot: "bg-blue-500" },
  { bg: "bg-cyan-50", text: "text-cyan-900", border: "border-cyan-200", dot: "bg-cyan-500" },
  { bg: "bg-emerald-50", text: "text-emerald-900", border: "border-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-violet-50", text: "text-violet-900", border: "border-violet-200", dot: "bg-violet-500" },
  { bg: "bg-amber-50", text: "text-amber-900", border: "border-amber-200", dot: "bg-amber-500" },
  { bg: "bg-rose-50", text: "text-rose-900", border: "border-rose-200", dot: "bg-rose-500" },
  { bg: "bg-teal-50", text: "text-teal-900", border: "border-teal-200", dot: "bg-teal-500" },
  { bg: "bg-indigo-50", text: "text-indigo-900", border: "border-indigo-200", dot: "bg-indigo-500" },
  { bg: "bg-fuchsia-50", text: "text-fuchsia-900", border: "border-fuchsia-200", dot: "bg-fuchsia-500" },
  { bg: "bg-lime-50", text: "text-lime-900", border: "border-lime-200", dot: "bg-lime-500" },
]

/** Stable string hash (djb2) so ordering never changes the mapping. */
function hashString(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return Math.abs(hash)
}

export function getSubjectColor(subjectId: string): SubjectColor {
  return PALETTE[hashString(subjectId) % PALETTE.length]
}
