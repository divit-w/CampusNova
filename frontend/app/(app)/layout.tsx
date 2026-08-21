"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { ConnectionPill } from "@/components/connection-pill"
import { BrandLogo } from "@/components/brand-logo"
import { LavaBackground } from "@/components/lava-background"
import { AlertProvider } from "@/lib/alerts"
import { getToken } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { NAV_ITEMS, landingForRole } from "@/lib/nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Auth gate.
  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, user, router])

  // Role gate (audit P1-6): route users away from screens their role can't access.
  useEffect(() => {
    if (loading || !user) return
    const match = [...NAV_ITEMS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)))
    if (match && !match.roles.includes(user.role)) {
      router.replace(landingForRole(user.role))
    }
  }, [pathname, user, loading, router])

  if (loading || !user) {
    return (
      <>
        <LavaBackground />
        <div className="grid min-h-screen place-items-center">
          <div className="flex flex-col items-center gap-4">
            <BrandLogo showWordmark={false} className="animate-pulse-live" />
            <p className="text-sm text-muted-foreground">Loading your workspace…</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <AlertProvider token={getToken()}>
      <LavaBackground />
      <div className="flex min-h-screen">
        <AppSidebar
          role={user.role}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader onOpenMobile={() => setMobileOpen(true)} />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
      <ConnectionPill />
    </AlertProvider>
  )
}
