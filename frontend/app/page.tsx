"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { landingForRole } from "@/lib/nav"
import { BrandLogo } from "@/components/brand-logo"

/**
 * Entry gate. Sends authenticated users to their role landing and everyone
 * else to /login. Admins land on the dashboard; non-admins on /my-schedule.
 */
export default function IndexPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace("/login")
    else router.replace(landingForRole(user.role))
  }, [user, loading, router])

  return (
    <div className="grid min-h-screen place-items-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <BrandLogo showWordmark={false} className="animate-pulse-live" />
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      </div>
    </div>
  )
}
