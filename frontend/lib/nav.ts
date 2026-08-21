import type { LucideIcon } from "lucide-react"
import {
  Bus,
  CalendarRange,
  ClipboardCheck,
  LayoutDashboard,
  MessagesSquare,
  Repeat2,
  ScanSearch,
  Sparkles,
  UserRound,
} from "lucide-react"
import type { Role } from "./types"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: Role[]
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["admin"] },
  { label: "AI Command", href: "/assistant", icon: Sparkles, roles: ["admin"] },
  { label: "Knowledge", href: "/knowledge", icon: MessagesSquare, roles: ["admin"] },
  { label: "Documents", href: "/documents", icon: ScanSearch, roles: ["admin"] },
  { label: "Timetable", href: "/timetable", icon: CalendarRange, roles: ["admin"] },
  { label: "Substitutes", href: "/substitute", icon: Repeat2, roles: ["admin"] },
  { label: "Attendance", href: "/attendance", icon: ClipboardCheck, roles: ["admin", "teacher"] },
  { label: "Transport", href: "/transport", icon: Bus, roles: ["admin"] },
  { label: "My Portal", href: "/portals/teacher", icon: UserRound, roles: ["teacher"] },
  { label: "My Portal", href: "/portals/student", icon: UserRound, roles: ["student"] },
]

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

/** Landing route per role — non-admins are routed to their read-only portal (audit P1-6). */
export function landingForRole(role: Role): string {
  if (role === "admin") return "/"
  if (role === "teacher") return "/portals/teacher"
  return "/portals/student"
}
