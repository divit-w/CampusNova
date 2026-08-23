"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, ShieldCheck, MapPin, Clock, Calendar, User, Camera, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { api } from "@/lib/api"
import type { FacultyAttendanceRecord } from "@/lib/types"

interface ProofModalProps {
  record: FacultyAttendanceRecord | null
  isOpen: boolean
  onClose: () => void
}

export function ProofModal({ record, isOpen, onClose }: ProofModalProps) {
  if (!isOpen || !record) return null

  const proofUrl = record.record_id ? api.getAttendanceProofUrl(record.record_id) : null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-none">Attendance Verification Proof</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Biometric & GPS audit trail</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Selfie Image Stream */}
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-border bg-black/90 flex items-center justify-center shadow-inner">
              {proofUrl ? (
                <img
                  src={proofUrl}
                  alt={`Selfie proof for ${record.full_name}`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = "none"
                    const parent = target.parentElement
                    if (parent) {
                      const placeholder = document.createElement("div")
                      placeholder.className = "flex flex-col items-center gap-2 p-6 text-center text-muted-foreground"
                      placeholder.innerHTML = `<span class="grid h-10 w-10 place-items-center rounded-full bg-secondary"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></span><p class="text-xs">Proof capture unavailable on server.</p>`
                      parent.appendChild(placeholder)
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
                  <Camera className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-xs">No verification selfie recorded for this entry.</p>
                </div>
              )}

              {/* Status Overlay Badge */}
              <div className="absolute top-3 right-3">
                <Badge variant={record.status === "present" ? "success" : "neutral"} className="gap-1 shadow-md">
                  <ShieldCheck className="h-3 w-3" />
                  {record.status.toUpperCase()}
                </Badge>
              </div>
            </div>

            {/* Audit Metadata Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
                  <User className="h-3.5 w-3.5" />
                  <span>Faculty</span>
                </div>
                <p className="font-semibold text-foreground truncate">{record.full_name}</p>
                <p className="text-[10px] text-muted-foreground">{record.subject}</p>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Clock-in Time</span>
                </div>
                <p className="font-semibold text-foreground">{record.clock_in_time || "Not Recorded"}</p>
                <p className="text-[10px] text-muted-foreground">{record.date}</p>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Location Status</span>
                </div>
                <p className="font-semibold text-foreground">
                  {record.location_verified ? "Inside Geofence" : "Location Unverified"}
                </p>
                {record.distance_meters !== null && record.distance_meters !== undefined && (
                  <p className="text-[10px] text-muted-foreground">{Math.round(record.distance_meters)}m from campus</p>
                )}
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Biometric Liveness</span>
                </div>
                <p className="font-semibold text-foreground">
                  {record.liveness_verified ? "Verified Live" : "Unverified"}
                </p>
                <p className="text-[10px] text-muted-foreground">Multi-signal vision check</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-3 bg-muted/20 flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
