"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, LogOut, Menu } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { BrandLogo } from "@/components/brand-logo"
import { NAV_ITEMS } from "@/lib/nav"
import { useAuth } from "@/lib/auth"
import { easeOutSoft } from "@/lib/motion"
import type { Role } from "@/lib/types"
import { cn } from "@/lib/utils"

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  teacher: "Teacher",
  student: "Student",
}

function titleForPath(pathname: string): string {
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)))
  return match?.label ?? "CampusNova"
}

export function AppHeader({ onOpenMobile }: { onOpenMobile: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const displayName = "Admin"
  const initials = "A"

  return (
    <header className="glass-surface sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-6">
      <button
        onClick={onOpenMobile}
        className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <BrandLogo showWordmark={false} className="md:hidden" />

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.h1
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={easeOutSoft}
            className="truncate text-lg font-semibold tracking-tight"
          >
            {(pathname === '/' || pathname === '/dashboard') ? `Good to see you, ${displayName}.` : titleForPath(pathname)}
          </motion.h1>
        </AnimatePresence>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="glass flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-all duration-300 ease-spring hover:scale-[1.02] hover:shadow-glow-primary"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-live text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[140px] truncate text-sm font-medium leading-tight">
              {displayName}
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", menuOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="glass-surface absolute right-0 mt-2 w-60 overflow-hidden rounded-xl p-2 shadow-soft-lg"
            >
              <div className="flex items-center gap-3 rounded-xl p-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-live text-xs font-semibold text-primary-foreground">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <div className="px-2.5 pb-2">
                {user && (
                  <Badge variant="default" className="capitalize">
                    {ROLE_LABELS[user.role]}
                  </Badge>
                )}
              </div>
              <div className="my-1 h-px bg-border" />
              <button
                onClick={() => {
                  logout()
                  router.replace("/login")
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
