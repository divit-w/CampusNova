"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bus, Plus, Trash2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { riseItem, staggerContainer } from "@/lib/motion"
import type { VehicleSpec } from "@/lib/types"

// Campus depot coordinates (app/core/config.py :: CAMPUS_LAT/CAMPUS_LON) with
// small offsets so the seeded fleet doesn't start from one identical point.
const DEPOT: [number, number] = [28.6304, 77.3711]

interface DraftVehicle {
  key: string
  vehicle_id: string
  capacity: string
  lat: string
  lon: string
}

function seedFleet(): DraftVehicle[] {
  return [
    { key: "v1", vehicle_id: "BUS-1", capacity: "40", lat: (DEPOT[0] + 0.002).toFixed(4), lon: (DEPOT[1] - 0.003).toFixed(4) },
    { key: "v2", vehicle_id: "BUS-2", capacity: "40", lat: (DEPOT[0] - 0.003).toFixed(4), lon: (DEPOT[1] + 0.002).toFixed(4) },
  ]
}

export function FleetBuilderForm({
  onOptimize,
  loading,
}: {
  onOptimize: (vehicles: VehicleSpec[]) => void
  loading: boolean
}) {
  const [rows, setRows] = useState<DraftVehicle[]>(seedFleet)
  const [formError, setFormError] = useState<string | null>(null)

  function addRow() {
    const n = rows.length + 1
    setRows((r) => [
      ...r,
      {
        key: `v${Date.now()}`,
        vehicle_id: `BUS-${n}`,
        capacity: "40",
        lat: DEPOT[0].toFixed(4),
        lon: DEPOT[1].toFixed(4),
      },
    ])
  }

  function removeRow(key: string) {
    setRows((r) => r.filter((row) => row.key !== key))
  }

  function updateRow(key: string, patch: Partial<DraftVehicle>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (rows.length === 0) {
      setFormError("Add at least one vehicle to the fleet.")
      return
    }

    const vehicles: VehicleSpec[] = []
    for (const row of rows) {
      const capacity = Number(row.capacity)
      const lat = Number(row.lat)
      const lon = Number(row.lon)
      if (!row.vehicle_id.trim() || !Number.isFinite(capacity) || capacity < 1 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        setFormError("Every vehicle needs an ID, a capacity of at least 1, and valid start coordinates.")
        return
      }
      vehicles.push({ vehicle_id: row.vehicle_id.trim(), capacity, start_location: [lat, lon] })
    }

    onOptimize(vehicles)
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bus className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Vehicle fleet builder</p>
            <p className="text-xs text-muted-foreground">Capacity &amp; depot per bus</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add vehicle
        </Button>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-1 flex-col">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.div
                key={row.key}
                variants={riseItem}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                layout
                className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-border bg-surface/60 p-3"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="col-span-2 space-y-1 sm:col-span-1">
                    <Label className="text-[11px] text-muted-foreground">Vehicle ID</Label>
                    <Input
                      value={row.vehicle_id}
                      onChange={(e) => updateRow(row.key, { vehicle_id: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Capacity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.capacity}
                      onChange={(e) => updateRow(row.key, { capacity: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Depot lat</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={row.lat}
                      onChange={(e) => updateRow(row.key, { lat: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Depot lon</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={row.lon}
                      onChange={(e) => updateRow(row.key, { lon: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  aria-label={`Remove ${row.vehicle_id}`}
                  className="grid h-9 w-9 place-items-center self-end rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}

        <Button type="submit" disabled={loading} className="mt-4 gap-1.5">
          <Wand2 className="h-4 w-4" />
          {loading ? "Optimizing routes…" : "Optimize routes"}
        </Button>
      </form>
    </Card>
  )
}
