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

import { GOOGLE_CLIENT_ID } from "@/lib/config"

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential?: string; select_by?: string }) => void
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
          }) => void
          prompt: (callback?: (notification: {
            isNotDisplayed: () => boolean
            isSkippedMoment: () => boolean
            isDismissedMoment: () => boolean
            getNotDisplayedReason: () => string
            getSkippedReason: () => string
            getDismissedReason: () => string
          }) => void) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string
              theme?: string
              size?: string
              text?: string
              shape?: string
              logo_alignment?: string
              width?: number | string
            }
          ) => void
          cancel: () => void
        }
      }
    }
  }
}

const HIGHLIGHTS = [
  { icon: Sparkles, title: "AI Command", body: "Ask operational questions in plain language." },
  { icon: CalendarRange, title: "Smart Timetables", body: "Constraint-solved schedules in seconds." },
  { icon: Repeat2, title: "Live Substitutes", body: "Resolve absences with ranked cover, instantly." },
]

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, login, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [gisLoaded, setGisLoaded] = useState(false)

  // Load Google Identity Services script
  useEffect(() => {
    if (typeof window === "undefined") return

    if (window.google?.accounts?.id) {
      setGisLoaded(true)
      return
    }

    const script = document.createElement("script")
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = () => setGisLoaded(true)
    script.onerror = () => setGisLoaded(false)
    document.head.appendChild(script)

    return () => {
      // clean up if needed
    }
  }, [])

  // Initialize GIS if client ID is configured
  useEffect(() => {
    if (!gisLoaded || !GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      })
    } catch (err) {
      console.warn("Failed to initialize Google Identity Services:", err)
    }
  }, [gisLoaded])

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "admin" && !user.is_setup_complete && !user.is_demo) {
        router.replace("/admin/setup")
      } else {
        router.replace(landingForRole(user.role))
      }
    }
  }, [user, loading, router])

  async function performLogin(targetEmail: string, targetPassword: string) {
    setError(null)
    setSubmitting(true)
    try {
      const me = await login(targetEmail.trim(), targetPassword)
      if (me.role === "admin" && !me.is_setup_complete && !me.is_demo) {
        router.replace("/admin/setup")
      } else {
        router.replace(landingForRole(me.role))
      }
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

  async function onGoogleCredentialResponse(response: { credential?: string }) {
    if (!response?.credential) {
      setError("Google authentication was not completed. Please try again.")
      setSubmitting(false)
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const me = await loginWithGoogle(response.credential)
      if (me.role === "admin" && !me.is_setup_complete && !me.is_demo) {
        router.replace("/admin/setup")
      } else {
        router.replace(landingForRole(me.role))
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || "Google authentication failed.")
      } else {
        setError("Google authentication encountered an unexpected error.")
      }
      setSubmitting(false)
    }
  }

  async function handleGoogleLogin() {
    setError(null)

    // Check if Google OAuth Client ID is configured
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_ID.trim()) {
      setError("Google Sign-In is currently unavailable. Please configure Google OAuth or use email/password.")
      return
    }

    if (!window.google?.accounts?.id) {
      setError("Google Sign-In is currently unavailable. Please configure Google OAuth or use email/password.")
      return
    }

    try {
      setSubmitting(true)
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setSubmitting(false)
          // If One Tap is suppressed or skipped, user can configure or retry
          const reason = notification.isNotDisplayed()
            ? notification.getNotDisplayedReason()
            : notification.getSkippedReason()
          if (reason === "opt_out_or_no_session" || reason === "suppressed_by_user") {
            setError("Google account prompt was dismissed. Please select an active Google account to proceed.")
          }
        }
      })
    } catch (err) {
      setSubmitting(false)
      setError("Google Sign-In is currently unavailable. Please configure Google OAuth or use email/password.")
    }
  }


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await performLogin(email, password)
  }

  async function onJudgeAccess() {
    setEmail("demo-judge@campusnova.com")
    setPassword("judge123")
    await performLogin("demo-judge@campusnova.com", "judge123")
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

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Sign in to CampusNova</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Enter your academic credentials or continue with Google.</p>

          <div className="mt-6 flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={submitting}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2.5 bg-white text-slate-800 hover:bg-slate-50 border-slate-200 shadow-sm font-medium"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Sign in with Google</span>
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white/70 px-2 text-muted-foreground backdrop-blur-sm">Or with email</span>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

            <Button type="submit" size="lg" disabled={submitting} className="mt-2 font-medium">
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

          {/* Subtle Demo Evaluation Link */}
          <div className="mt-6 pt-4 border-t border-slate-200/80 text-center">
            <p className="text-xs text-muted-foreground">Evaluating CampusNova for your institution?</p>
            <button
              type="button"
              disabled={submitting}
              onClick={onJudgeAccess}
              className="mt-1.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 hover:underline disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Signing into Demo…</span>
                </>
              ) : (
                <>
                  <span>Sign in as Demo Administrator</span>
                  <span className="text-[10px] text-muted-foreground font-normal">(demo-judge@campusnova.com)</span>
                </>
              )}
            </button>
          </div>


        </motion.div>
      </section>
      </main>
    </>
  )
}
