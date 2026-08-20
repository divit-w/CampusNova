"use client"

import { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

/** CampusNova wordmark + logo mark. Falls back to the geometric glyph if /logo.png is missing. */
export function BrandLogo({
  showWordmark = true,
  className,
}: {
  showWordmark?: boolean
  className?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-live text-primary-foreground shadow-soft"
      >
        {imgFailed ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 19V5l14 14V5" />
          </svg>
        ) : (
          <Image
            src="/logo.png"
            alt=""
            fill
            sizes="36px"
            className="object-cover"
            priority
            onError={() => setImgFailed(true)}
          />
        )}
      </span>
      {showWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Campus<span className="text-primary">Nova</span>
        </span>
      )}
    </div>
  )
}
