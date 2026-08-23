import type { LucideIcon } from "lucide-react"
import {
  CalendarRange,
  ClipboardCheck,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Repeat2,
  ScanSearch,
  Sparkles,
  UserRound,
  Users,
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
  { label: "User Management", href: "/admin/users", icon: Users, roles: ["admin"] },
  { label: "Doc Library", href: "/admin/documents", icon: Library, roles: ["admin"] },
]

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

/** Landing route per role */
export function landingForRole(role: Role): string {
  return "/"
}
