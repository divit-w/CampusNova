"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

/** CampusNova wordmark + logo mark. */
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
        className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl shadow-soft"
      >
        <Image
          src="/logo.png"
          alt="CampusNova Logo"
          fill
          sizes="36px"
          className="object-cover"
          priority
        />
      </span>
      {showWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Campus<span className="text-primary">Nova</span>
        </span>
      )}
    </div>
  )
}
