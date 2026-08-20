import type { LucideIcon } from "lucide-react"
import { Bus, CalendarRange, LayoutDashboard, MessagesSquare, Repeat2, Sparkles, UserRound } from "lucide-react"
import type { Role } from "./types"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: Role[]
  phase2?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["admin"] },
  { label: "AI Command", href: "/assistant", icon: Sparkles, roles: ["admin"] },
  { label: "Timetable", href: "/timetable", icon: CalendarRange, roles: ["admin"] },
  { label: "Substitutes", href: "/substitute", icon: Repeat2, roles: ["admin"] },
  { label: "Attendance", href: "/attendance", icon: MessagesSquare, roles: ["admin"], phase2: true },
  { label: "Transport", href: "/transport", icon: Bus, roles: ["admin"], phase2: true },
  { label: "My Schedule", href: "/my-schedule", icon: UserRound, roles: ["teacher", "student"] },
]

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

/** Landing route per role — non-admins are routed to their read-only portal (audit P1-6). */
export function landingForRole(role: Role): string {
  return role === "admin" ? "/" : "/my-schedule"
}
