"use client"

import { motion } from "framer-motion"
import { Fuel, Gauge } from "lucide-react"
import { Card } from "@/components/ui/card"
import { riseItem, staggerContainer } from "@/lib/motion"
import { haversineKm } from "@/lib/geo"
import type { OptimizedRoute, VehicleSpec } from "@/lib/types"

/**
 * Both metrics are derived client-side from the solver response — no
 * separate backend field exists for either, so we compute them transparently:
 *   - Capacity utilization = students routed ÷ total fleet capacity submitted.
 *   - Fuel savings = optimized chained-route distance vs. a naive baseline
 *     of picking up every student with a dedicated round trip from their
 *     assigned vehicle's depot.
 */
export function TransportMetrics({ vehicles, routes }: { vehicles: VehicleSpec[]; routes: OptimizedRoute[] }) {
  const totalCapacity = vehicles.reduce((sum, v) => sum + v.capacity, 0)
  const totalRouted = routes.reduce((sum, r) => sum + r.assigned_student_count, 0)
  const utilization = totalCapacity > 0 ? Math.min(totalRouted / totalCapacity, 1) : 0

  const depotByVehicle = new Map(vehicles.map((v) => [v.vehicle_id, v.start_location]))
  let optimizedKm = 0
  let naiveKm = 0
  for (const route of routes) {
    optimizedKm += route.estimated_distance_km
    const depot = depotByVehicle.get(route.vehicle_id)
    if (!depot) continue
    for (const stop of route.stops) {
      naiveKm += 2 * haversineKm(depot, stop.location)
    }
  }
  const fuelSavings = naiveKm > 0 ? Math.max(1 - optimizedKm / naiveKm, 0) : 0

  const tiles = [
    {
      key: "utilization",
      label: "Capacity utilization",
      value: `${Math.round(utilization * 100)}%`,
      sub: `${totalRouted} of ${totalCapacity} seats filled`,
      icon: Gauge,
      tone: "text-primary",
      tint: "bg-primary/10",
      barValue: utilization,
    },
    {
      key: "fuel",
      label: "Estimated fuel savings",
      value: `${Math.round(fuelSavings * 100)}%`,
      sub: `vs. one round trip per student`,
      icon: Fuel,
      tone: "text-success",
      tint: "bg-success/10",
      barValue: fuelSavings,
    },
  ]

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2">
      {tiles.map((tile) => (
        <motion.div key={tile.key} variants={riseItem}>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${tile.tint} ${tile.tone}`}>
                <tile.icon className="h-[18px] w-[18px]" />
              </span>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{tile.value}</p>
            </div>
            <p className="mt-3 text-sm font-medium">{tile.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.sub}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(tile.barValue * 100)}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`h-full rounded-full ${tile.tone.replace("text-", "bg-")}`}
              />
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  )
}
