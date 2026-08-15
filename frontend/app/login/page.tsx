"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { motion } from "framer-motion"
import { CalendarRange, Loader2, Repeat2, Sparkles } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { LavaBackground } from "@/components/lava-background"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { landingForRole } from "@/lib/nav"
import { ApiError } from "@/lib/api"
import { staggerContainer, riseItem, spring } from "@/lib/motion"

const HIGHLIGHTS = [
  { icon: Sparkles, title: "AI Command", body: "Ask operational questions in plain language." },
  { icon: CalendarRange, title: "Smart Timetables", body: "Constraint-solved schedules in seconds." },
  { icon: Repeat2, title: "Live Substitutes", body: "Resolve absences with ranked cover, instantly." },
]

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace(landingForRole(user.role))
  }, [user, loading, router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const me = await login(email.trim(), password)
      router.replace(landingForRole(me.role))
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError("Incorrect email or password.")
        else if (err.status === 0) setError(err.detail)
        else setError(err.detail || "Sign in failed. Please try again.")
      } else {
        setError("Something went wrong. Please try again.")
      }
      setSubmitting(false)
    }
  }

  return (
    <>
      <LavaBackground />
      <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-live p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)",
            backgroundSize: "48px 48px, 64px 64px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 overflow-hidden shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Image
              src="/logo.png"
              alt="CampusNova Logo"
              fill
              sizes="36px"
              className="object-cover"
              priority
            />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">CampusNova</span>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="relative max-w-md">
          <motion.h2 variants={riseItem} className="text-pretty text-4xl font-semibold leading-[1.1] tracking-tight">
            The calm control center for your entire campus.
          </motion.h2>
          <motion.p variants={riseItem} className="mt-4 text-pretty text-base leading-relaxed text-primary-foreground/85">
            One console for AI-assisted operations, constraint-solved timetables, and real-time
            substitute cover — built for the people who keep school running.
          </motion.p>

          <motion.ul variants={staggerContainer} className="mt-10 flex flex-col gap-3">
            {HIGHLIGHTS.map((h) => (
              <motion.li
                key={h.title}
                variants={riseItem}
                className="flex items-start gap-3.5 rounded-xl bg-white/10 p-3.5 backdrop-blur"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
                  <h.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="text-sm text-primary-foreground/80">{h.body}</p>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>

        <p className="relative text-xs text-primary-foreground/70">
          © {new Date().getFullYear()} CampusNova. Intelligent campus operations.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="bg-white/60 backdrop-blur-2xl border border-white/50 shadow-xl w-full max-w-sm rounded-xl p-8 sm:p-10"
        >
          <div className="mb-8 lg:hidden">
            <BrandLogo />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-balance">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your CampusNova workspace.</p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" size="lg" disabled={submitting} className="mt-2">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-6 text-pretty text-center text-xs leading-relaxed text-muted-foreground">
            Connected to the CampusNova API. Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_API_URL</code>{" "}
            to point at your backend.
          </p>
        </motion.div>
      </section>
      </main>
    </>
  )
}
