"use client"

import { useEffect, useMemo } from "react"
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { OptimizedRoute, VehicleSpec } from "@/lib/types"

const PALETTE = [
  "#6366f1", // Indigo / Primary
  "#ec4899", // Pink / Live
  "#10b981", // Emerald / Success
  "#f59e0b", // Amber / Warning
  "#8b5cf6", // Violet
  "#06b6d4", // Cyan
]

function createDepotIcon(color: string) {
  return L.divIcon({
    className: "custom-depot-marker",
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
        <div style="position: absolute; inset: 0; border-radius: 9999px; background: ${color}; opacity: 0.35; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
        <div style="position: relative; z-index: 10; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 8px; background: #0f172a; color: ${color}; box-shadow: 0 4px 14px rgba(0,0,0,0.5); border: 2px solid ${color}; font-weight: bold; font-size: 13px;">
          🏫
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

function createStopIcon(color: string, order: number) {
  return L.divIcon({
    className: "custom-stop-marker",
    html: `
      <div style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 9999px; background: #0f172a; color: #f8fafc; border: 2px solid ${color}; box-shadow: 0 2px 10px rgba(0,0,0,0.4); font-weight: 700; font-size: 10px; font-family: sans-serif;">
        ${order}
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  })
}

function MapBoundsAutoFit({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [map, points])
  return null
}

export function LeafletMap({
  vehicles,
  routes,
}: {
  vehicles: VehicleSpec[]
  routes: OptimizedRoute[]
}) {
  const depotByVehicle = useMemo(
    () => new Map(vehicles.map((v) => [v.vehicle_id, v.start_location])),
    [vehicles]
  )

  const allPoints = useMemo(() => {
    const pts: [number, number][] = []
    for (const v of vehicles) pts.push(v.start_location)
    for (const r of routes) for (const s of r.stops) pts.push(s.location)
    return pts
  }, [vehicles, routes])

  // Fallback center: JIIT Campus Noida
  const defaultCenter: [number, number] = allPoints.length > 0 ? allPoints[0] : [28.6304, 77.3711]

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="h-full min-h-[420px] w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {allPoints.length > 0 && <MapBoundsAutoFit points={allPoints} />}

        {routes.map((route, i) => {
          const color = PALETTE[i % PALETTE.length]
          const depot = depotByVehicle.get(route.vehicle_id)
          if (!depot || route.stops.length === 0) return null

          const polylinePositions: [number, number][] = [depot, ...route.stops.map((s) => s.location)]

          return (
            <div key={route.vehicle_id}>
              <Polyline
                positions={polylinePositions}
                pathOptions={{
                  color,
                  weight: 4,
                  opacity: 0.85,
                  dashArray: "6, 8",
                }}
              />

              {/* Depot Marker */}
              <Marker position={depot} icon={createDepotIcon(color)}>
                <Popup className="glass-popup">
                  <div className="p-1">
                    <p className="font-semibold text-xs text-foreground">Depot · {route.vehicle_id}</p>
                    <p className="text-[11px] text-muted-foreground">Start / End station</p>
                    <p className="text-[11px] font-medium text-primary mt-1">{route.assigned_student_count} students routed</p>
                  </div>
                </Popup>
              </Marker>

              {/* Student Stop Markers */}
              {route.stops.map((stop) => (
                <Marker
                  key={`${route.vehicle_id}-${stop.stop_order}`}
                  position={stop.location}
                  icon={createStopIcon(color, stop.stop_order)}
                >
                  <Popup>
                    <div className="p-1">
                      <p className="font-semibold text-xs text-foreground">
                        Stop #{stop.stop_order} ({route.vehicle_id})
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Students: <span className="font-medium text-foreground">{stop.student_ids.join(", ")}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Coords: {stop.location[0].toFixed(4)}, {stop.location[1].toFixed(4)}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </div>
          )
        })}
      </MapContainer>
    </div>
  )
}
