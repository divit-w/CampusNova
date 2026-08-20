"use client"

import { motion } from "framer-motion"
import { Map, Route } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/states"
import type { OptimizedRoute, VehicleSpec } from "@/lib/types"

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--live))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(280 65% 55%)",
  "hsl(340 70% 55%)",
]

/**
 * Abstract, stylized route canvas — plots depot + stop coordinates onto a
 * normalized 0–100 grid. This is a preview surface, not a real basemap;
 * swap for Leaflet/Mapbox tiles in production to render actual streets.
 */
export function RouteMapPreview({ vehicles, routes }: { vehicles: VehicleSpec[]; routes: OptimizedRoute[] }) {
  const depotByVehicle = new Map(vehicles.map((v) => [v.vehicle_id, v.start_location]))
  const points: Array<[number, number]> = []
  for (const v of vehicles) points.push(v.start_location)
  for (const r of routes) for (const s of r.stops) points.push(s.location)

  const hasData = routes.some((r) => r.stops.length > 0)

  if (!hasData) {
    return (
      <Card className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border p-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <Map className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Route preview</p>
            <p className="text-xs text-muted-foreground">Leaflet/Mapbox-ready canvas</p>
          </div>
        </div>
        <EmptyState
          icon={Route}
          title="No routes yet"
          description="Build your fleet and optimize to see KMeans-clustered, TSP-ordered pickup routes plotted here."
          className="flex-1"
        />
      </Card>
    )
  }

  const lats = points.map((p) => p[0])
  const lons = points.map((p) => p[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const latSpan = Math.max(maxLat - minLat, 0.0005)
  const lonSpan = Math.max(maxLon - minLon, 0.0005)
  const pad = 12

  function project([lat, lon]: [number, number]) {
    const x = pad + ((lon - minLon) / lonSpan) * (100 - pad * 2)
    const y = pad + ((maxLat - lat) / latSpan) * (100 - pad * 2)
    return { x, y }
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <Map className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Route preview</p>
            <p className="text-xs text-muted-foreground">Leaflet/Mapbox-ready canvas</p>
          </div>
        </div>
        <Badge variant="neutral">{routes.length} active routes</Badge>
      </div>

      <div className="relative flex-1 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:20px_20px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {routes.map((route, i) => {
            const color = PALETTE[i % PALETTE.length]
            const depot = depotByVehicle.get(route.vehicle_id)
            if (!depot || route.stops.length === 0) return null
            const depotP = project(depot)
            const stopPs = route.stops.map((s) => project(s.location))
            const path = [depotP, ...stopPs].map((p) => `${p.x},${p.y}`).join(" ")
            return (
              <motion.polyline
                key={route.vehicle_id}
                points={path}
                fill="none"
                stroke={color}
                strokeWidth={0.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            )
          })}
        </svg>

        {routes.map((route, i) => {
          const color = PALETTE[i % PALETTE.length]
          const depot = depotByVehicle.get(route.vehicle_id)
          if (!depot) return null
          const depotP = project(depot)
          return (
            <div key={`depot-${route.vehicle_id}`}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.08 }}
                className="absolute grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border-2 border-card shadow-soft"
                style={{ left: `${depotP.x}%`, top: `${depotP.y}%`, background: color }}
                title={`${route.vehicle_id} depot`}
              />
              {route.stops.map((stop, si) => {
                const p = project(stop.location)
                return (
                  <motion.div
                    key={`${route.vehicle_id}-${stop.stop_order}`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.08 + si * 0.03 + 0.2 }}
                    className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-card"
                    style={{ left: `${p.x}%`, top: `${p.y}%`, background: color }}
                    title={`Stop ${stop.stop_order} · ${stop.student_ids.join(", ")}`}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border p-4">
        {routes.map((route, i) => (
          <div key={route.vehicle_id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            {route.vehicle_id} · {route.assigned_student_count} students
          </div>
        ))}
      </div>
    </Card>
  )
}
