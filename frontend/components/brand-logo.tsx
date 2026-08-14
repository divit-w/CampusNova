import { cn } from "@/lib/utils"

/** CampusNova wordmark + glyph. Geometric "N/compass" mark in brand blue→cyan. */
export function BrandLogo({
  showWordmark = true,
  className,
}: {
  showWordmark?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-live text-primary-foreground shadow-soft"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19V5l14 14V5" />
        </svg>
      </span>
      {showWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Campus<span className="text-primary">Nova</span>
        </span>
      )}
    </div>
  )
}
