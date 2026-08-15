/** Shared "3m ago" / "2h ago" formatter for timestamps across the alert feed and KPI tiles. */
export function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Same as relativeTime but accepts a backend ISO string (or null when nothing has happened yet). */
export function relativeTimeFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return null
  return relativeTime(ts)
}
