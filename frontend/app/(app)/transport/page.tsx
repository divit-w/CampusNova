"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { PageHeading, ErrorState } from "@/components/states"
import { FleetBuilderForm } from "@/components/transport/fleet-builder-form"
import { RouteMapPreview } from "@/components/transport/route-map-preview"
import { TransportMetrics } from "@/components/transport/transport-metrics"
import { api } from "@/lib/api"
import { spring } from "@/lib/motion"
import type { TransportOptimizationResponse, VehicleSpec } from "@/lib/types"

export default function TransportPage() {
  const [vehicles, setVehicles] = useState<VehicleSpec[]>([])
  const [result, setResult] = useState<TransportOptimizationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function optimize(fleet: VehicleSpec[]) {
    setVehicles(fleet)
    setLoading(true)
    setError(null)
    try {
      const res = await api.optimizeRoutes({ vehicles: fleet })
      setResult(res)
    } catch (err) {
      setError(err)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeading
        title="Smart Transport Optimizer"
        description="Cluster student pickups with KMeans and sequence each route with a Nearest-Neighbor TSP heuristic — build your fleet and optimize to see the plan."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <FleetBuilderForm onOptimize={optimize} loading={loading} />

        <div className="flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="rounded-2xl border border-border bg-card">
                  <ErrorState error={error} onRetry={() => optimize(vehicles)} />
                </div>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className="flex flex-col gap-6"
              >
                <TransportMetrics vehicles={vehicles} routes={result.routes} />
                <RouteMapPreview vehicles={vehicles} routes={result.routes} />
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full min-h-[420px]">
                <RouteMapPreview vehicles={[]} routes={[]} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
