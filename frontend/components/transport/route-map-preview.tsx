"use client"

import dynamic from "next/dynamic"
import { Map as MapIcon, Route } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/states"
import { Skeleton } from "@/components/ui/skeleton"
import type { OptimizedRoute, VehicleSpec } from "@/lib/types"

const PALETTE = [
  "#6366f1", // Indigo / Primary
  "#ec4899", // Pink / Live
  "#10b981", // Emerald / Success
  "#f59e0b", // Amber / Warning
  "#8b5cf6", // Violet
  "#06b6d4", // Cyan
]

// Dynamically import the real Leaflet map with ssr: false to prevent window/document undefined issues
const LeafletMap = dynamic(
  () => import("./leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] w-full items-center justify-center bg-card/20 backdrop-blur-sm">
        <Skeleton className="h-full min-h-[420px] w-full rounded-none" />
      </div>
    ),
  }
)

export function RouteMapPreview({
  vehicles,
  routes,
}: {
  vehicles: VehicleSpec[]
  routes: OptimizedRoute[]
}) {
  const hasData = routes.some((r) => r.stops.length > 0)

  if (!hasData) {
    return (
      <Card className="flex h-full min-h-[460px] flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border p-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <MapIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Interactive Route Map</p>
            <p className="text-xs text-muted-foreground">Live OpenStreetMap + KMeans Clustering</p>
          </div>
        </div>
        <EmptyState
          icon={Route}
          title="No routes generated yet"
          description="Build your vehicle fleet and click 'Optimize routes' to cluster student pickups and plot real-time TSP paths on the map."
          className="flex-1"
        />
      </Card>
    )
  }

  return (
    <Card className="flex h-full min-h-[460px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <MapIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Interactive Route Map</p>
            <p className="text-xs text-muted-foreground">OpenStreetMap Live Geospatial View</p>
          </div>
        </div>
        <Badge variant="success" className="gap-1">
          {routes.length} Active {routes.length === 1 ? "Route" : "Routes"}
        </Badge>
      </div>

      <div className="relative flex-1 min-h-[400px] w-full overflow-hidden bg-background">
        <LeafletMap vehicles={vehicles} routes={routes} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface/50 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fleet Legend:</span>
        {routes.map((route, i) => (
          <div key={route.vehicle_id} className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 py-1 text-xs text-foreground shadow-sm">
            <span
              className="h-2.5 w-2.5 rounded-full shadow-sm"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="font-semibold">{route.vehicle_id}:</span>
            <span className="text-muted-foreground">{route.assigned_student_count} stops ({route.estimated_distance_km} km)</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
