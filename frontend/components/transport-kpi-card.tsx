"use client"

import Link from "next/link"
import useSWR from "swr"
import { motion } from "framer-motion"
import { ArrowRight, Bus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import type { TransportRoutesSummaryResponse } from "@/lib/types"
import { riseItem } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** Real KPI tile backed by GET /transport/routes-summary — the most recently persisted route plan. */
export function TransportKpiCard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useSWR<TransportRoutesSummaryResponse>(
    "transport-routes-summary",
    () => api.transportRoutesSummary(),
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  )

  if (isLoading && !data) {
    return (
      <Card className={cn("p-5", compact && "p-4")}>
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="mt-4 h-7 w-16" />
        <Skeleton className="mt-2 h-3.5 w-24" />
      </Card>
    )
  }

  return (
    <motion.div variants={riseItem}>
      <Link href="/transport" className="group block h-full">
        <Card
          className={cn(
            "h-full p-5 transition-all duration-300 ease-spring hover:-translate-y-1 hover:scale-[1.02] hover:shadow-glow-cyan",
            compact && "p-4",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-live/15 to-primary/10 text-live transition-transform duration-300 group-hover:scale-110">
              <Bus className="h-[18px] w-[18px]" />
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <p className="text-gradient-brand mt-4 text-2xl font-semibold tracking-tight tabular-nums">
            {data?.has_plan ? data.active_routes : "—"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.has_plan
              ? `Active transport routes · ${data.total_students_routed} students routed`
              : "No route plan generated yet"}
          </p>
        </Card>
      </Link>
    </motion.div>
  )
}
