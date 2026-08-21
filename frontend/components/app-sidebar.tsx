"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { navForRole, type NavItem } from "@/lib/nav"
import { spring } from "@/lib/motion"
import type { Role } from "@/lib/types"
import { cn } from "@/lib/utils"

interface SidebarProps {
  role: Role
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

function NavLinks({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[]
  collapsed: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        const Icon = item.icon
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent",
              collapsed && "justify-center px-0",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={spring}
                className="absolute inset-0 rounded-xl bg-primary/10"
              />
            )}
            <Icon
              aria-hidden="true"
              className={cn("relative z-10 h-[18px] w-[18px] shrink-0", active && "text-primary")}
            />
            {!collapsed && (
              <span className="relative z-10 flex-1 truncate">{item.label}</span>
            )}
          </Link>
        )

        if (collapsed) {
          return (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          )
        }
        return link
      })}
    </nav>
  )
}

export function AppSidebar({ role, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const items = navForRole(role)

  const inner = (mobile: boolean) => {
    const isCollapsed = collapsed && !mobile
    return (
      <div className="flex h-full flex-col">
        <div className={cn("flex h-16 items-center gap-2 px-4", isCollapsed ? "justify-center" : "justify-between")}>
          <BrandLogo showWordmark={!isCollapsed} />
          {mobile && (
            <button
              onClick={onCloseMobile}
              className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Close menu"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className={cn("px-4 pb-2", isCollapsed && "px-0 text-center")}>
          {!isCollapsed && (
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Workspace
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          <NavLinks items={items} collapsed={isCollapsed} onNavigate={mobile ? onCloseMobile : undefined} />
        </div>

        {!mobile && (
          <div className="border-t border-border p-3">
            <button
              onClick={onToggleCollapsed}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isCollapsed && "justify-center px-0",
              )}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={isCollapsed}
            >
              {isCollapsed ? (
                <PanelLeftOpen aria-hidden="true" className="h-[18px] w-[18px]" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px]" />
              )}
              {!isCollapsed && <span>Collapse</span>}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <TooltipProvider>
      {/* Desktop rail */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 76 : 264 }}
        transition={spring}
        className="sticky top-0 hidden h-screen shrink-0 border-r border-border bg-card md:block"
      >
        {inner(false)}
      </motion.aside>

      {/* Mobile slide-over */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={spring}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-card md:hidden"
            >
              {inner(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </TooltipProvider>
  )
}
