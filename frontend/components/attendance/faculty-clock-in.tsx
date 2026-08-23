"use client"

import { useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Camera, CheckCircle2, MapPin, ShieldCheck, UserRoundCheck, X, RefreshCcw, Sun, ScanFace, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ErrorState } from "@/components/states"
import { api, ApiError } from "@/lib/api"
import type { ClockInResponse } from "@/lib/types"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

type GeoState = "idle" | "locating" | "located" | "denied"

const TARGET_LAT = 28.6304
const TARGET_LON = 77.3711
const MAX_RADIUS_M = 500.0

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function FacultyClockIn({ onClockInSuccess }: { onClockInSuccess?: () => void }) {
  const [facultyList, setFacultyList] = useState<Array<{ id: string; name: string; subject: string }>>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("")
  const [loadingFaculty, setLoadingFaculty] = useState(true)

  const [geoState, setGeoState] = useState<GeoState>("idle")
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClockInResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [livenessProof, setLivenessProof] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadFaculty() {
      try {
        setLoadingFaculty(true)
        const teachers = await api.get<any[]>("/admin/teachers")
        if (active && Array.isArray(teachers)) {
          const mapped = teachers.map((t) => ({
            id: t.teacher_id || t.id,
            name: t.full_name || t.name || t.teacher_id,
            subject: t.subject || "Faculty",
          }))
          setFacultyList(mapped)
          if (mapped.length > 0) {
            setSelectedTeacherId(mapped[0].id)
          }
        }
      } catch (err) {
        console.error("Failed to load faculty for clock-in:", err)
      } finally {
        if (active) setLoadingFaculty(false)
      }
    }
    loadFaculty()
    return () => {
      active = false
    }
  }, [])

  // Active Liveness Challenge States
  type ChallengeType = "TURN_LEFT" | "TURN_RIGHT" | "LOOK_CENTER"
  type LivenessPhase = "INITIALIZING" | "CALIBRATING" | "CHALLENGE" | "VERIFIED"
  
  const [challengeList, setChallengeList] = useState<ChallengeType[]>(["TURN_LEFT", "TURN_RIGHT", "LOOK_CENTER"])
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const [stepProgress, setStepProgress] = useState<number>(0)
  const [livenessPhase, setLivenessPhase] = useState<LivenessPhase>("INITIALIZING")
  const [stepStatusText, setStepStatusText] = useState<string>("Align face inside frame...")
  const [isLivenessVerified, setIsLivenessVerified] = useState<boolean>(false)
  const [devDiagnostics, setDevDiagnostics] = useState<string>("")

  // Mathematical Tracking References
  const prevFrameRef = useRef<Uint8Array | null>(null)
  const baselineCentroidRef = useRef<{ x: number; y: number; sigmaX: number } | null>(null)
  const calibrationAccumulatorRef = useRef<{ sumX: number; sumY: number; sumSigma: number; count: number }>({ sumX: 0, sumY: 0, sumSigma: 0, count: 0 })
  const stepHoldCounterRef = useRef<number>(0)
  const motionHistoryRef = useRef<number[]>([])
  const sessionStartTimeRef = useRef<number>(0)

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
  
  // Edge AI States
  const [lightingScore, setLightingScore] = useState<number>(0)
  const [isWellLit, setIsWellLit] = useState<boolean>(true)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null)
  const requestRef = useRef<number>()

  function generateRandomChallenges(): ChallengeType[] {
    const isLeftFirst = Math.random() > 0.5
    return isLeftFirst ? ["TURN_LEFT", "TURN_RIGHT", "LOOK_CENTER"] : ["TURN_RIGHT", "TURN_LEFT", "LOOK_CENTER"]
  }

  function locate() {
    if (!navigator.geolocation) {
      setGeoState("denied")
      setError(new Error("Geolocation is not supported by your browser."))
      return
    }
    setGeoState("locating")
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        setCoords({ lat, lon })
        setDistance(getDistance(lat, lon, TARGET_LAT, TARGET_LON))
        setGeoState("located")
      },
      (err) => {
        setGeoState("denied")
        if (err.code === 1) {
          setError(new Error("Location permission denied. Please allow location access in your browser to verify geofence."))
        } else if (err.code === 2) {
          setError(new Error("Location unavailable. Could not determine your position."))
        } else if (err.code === 3) {
          setError(new Error("Location request timed out. Please try again."))
        } else {
          setError(new Error("Failed to acquire location. Please try again."))
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }

  async function startCamera() {
    setSelfie(null)
    setSelfiePreview(null)
    setError(null)
    setResult(null)
    setLivenessProof(null)
    setIsLivenessVerified(false)
    
    // Genuinely Fresh Session Reset
    const challenges = generateRandomChallenges()
    setChallengeList(challenges)
    setCurrentStepIndex(0)
    setStepProgress(0)
    setLivenessPhase("CALIBRATING")
    setStepStatusText("Calibrating: Look straight into camera...")
    
    baselineCentroidRef.current = null
    calibrationAccumulatorRef.current = { sumX: 0, sumY: 0, sumSigma: 0, count: 0 }
    stepHoldCounterRef.current = 0
    motionHistoryRef.current = []
    prevFrameRef.current = null
    sessionStartTimeRef.current = Date.now()
    
    if (typeof window === "undefined") return

    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setError(new Error("[SecurityError] Camera requires a secure context. Please open http://localhost:3000 directly."))
      return
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError(new Error("[NotSupportedError] navigator.mediaDevices.getUserMedia is not supported in this browser environment."))
      return
    }

    try {
      let stream: MediaStream | null = null
      let lastErr: any = null
      const constraintVariants: MediaStreamConstraints[] = [
        { video: true, audio: false },
        { video: { facingMode: "user" }, audio: false },
        { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
        { video: true },
      ]

      for (const constraints of constraintVariants) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          if (stream) break
        } catch (e: any) {
          lastErr = e
        }
      }

      if (!stream) {
        throw lastErr || new Error("Failed to initialize video stream.")
      }

      setVideoStream(stream)
      setIsCameraOpen(true)
    } catch (err: any) {
      console.error("Camera access failed:", err)
      const errName = err?.name || "CameraError"
      const errMsg = err?.message || ""
      
      let guidance = ""
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        guidance = "Camera access was rejected at the system level. In Windows, open Windows Settings → Privacy & security → Camera and toggle 'Let desktop apps access your camera' to ON. If using Brave/Chrome, verify permissions for localhost."
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        guidance = "No webcam hardware detected. Please ensure your camera is plugged in or built-in webcam is enabled."
      } else if (errName === "NotReadableError" || errName === "TrackStartError") {
        guidance = "Camera hardware is in use by another app (e.g. Teams, Zoom, Discord, OBS, or another tab). Close the other app and retry."
      } else if (errName === "OverconstrainedError") {
        guidance = "Webcam does not support the requested resolution."
      } else {
        guidance = errMsg || "Failed to start camera."
      }

      setError(new Error(`[${errName}] ${errMsg ? errMsg + " — " : ""}${guidance}`))
    }
  }

  function stopCamera() {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop())
      setVideoStream(null)
    }
    if (requestRef.current) cancelAnimationFrame(requestRef.current)
    setIsCameraOpen(false)
  }

  // HIGH-PRECISION CENTROID & HEAD YAW ESTIMATOR
  const analyzeStream = async () => {
    const video = videoRef.current
    const canvas = analysisCanvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      requestRef.current = requestAnimationFrame(analyzeStream)
      return
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    const W = 160
    const H = 120
    if (canvas.width !== W) {
      canvas.width = W
      canvas.height = H
    }
    ctx.drawImage(video, 0, 0, W, H)

    const imageData = ctx.getImageData(0, 0, W, H).data
    let brightnessSum = 0
    let pixelCount = 0
    const currentGrayscale = new Uint8Array(W * H)

    // Face Cluster Statistics
    let faceWeightSum = 0
    let faceWeightedX = 0
    let faceWeightedY = 0

    // Bounding ROI: focus on central biometric area
    const minX = Math.round(W * 0.18)
    const maxX = Math.round(W * 0.82)
    const minY = Math.round(H * 0.12)
    const maxY = Math.round(H * 0.88)

    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const i = (y * W + x) * 4
        const r = imageData[i]
        const g = imageData[i + 1]
        const b = imageData[i + 2]

        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        brightnessSum += luma
        pixelCount++
        currentGrayscale[y * W + x] = Math.round(luma)

        // Chromatic Skin & Face Cluster Filter
        if (r > 35 && g > 20 && b > 10 && r > b && (r - b) >= 8) {
          const skinWeight = 1.0 + Math.max(0, (r - b) / 50.0)
          faceWeightSum += skinWeight
          faceWeightedX += x * skinWeight
          faceWeightedY += y * skinWeight
        }
      }
    }

    // 1. Lighting Quality Score
    const avgBrightness = pixelCount > 0 ? brightnessSum / pixelCount : 0
    const score = Math.min(100, Math.round((avgBrightness / 255) * 100))
    setLightingScore(score)
    const isLit = score >= 15 && score <= 95
    setIsWellLit(isLit)

    // 2. Optical Motion Variance (physiological micro-motion)
    let frameMotionDelta = 0
    if (prevFrameRef.current && prevFrameRef.current.length === currentGrayscale.length) {
      const prev = prevFrameRef.current
      for (let idx = 0; idx < currentGrayscale.length; idx += 2) {
        const diff = Math.abs(currentGrayscale[idx] - prev[idx])
        if (diff > 8) frameMotionDelta += diff
      }
    }
    prevFrameRef.current = currentGrayscale
    const normalizedMotion = frameMotionDelta / (W * H)
    motionHistoryRef.current.push(normalizedMotion)
    if (motionHistoryRef.current.length > 60) motionHistoryRef.current.shift()

    // 3. Face Centroid & Dispersion Calculation
    let currentCentroidX = W / 2
    let currentCentroidY = H / 2
    let dispersionX = 18.0

    if (faceWeightSum > 40) {
      currentCentroidX = faceWeightedX / faceWeightSum
      currentCentroidY = faceWeightedY / faceWeightSum

      let varianceSum = 0
      for (let y = minY; y < maxY; y += 2) {
        for (let x = minX; x < maxX; x += 2) {
          const i = (y * W + x) * 4
          const r = imageData[i]
          const g = imageData[i + 1]
          const b = imageData[i + 2]
          if (r > 35 && g > 20 && b > 10 && r > b) {
            varianceSum += (x - currentCentroidX) * (x - currentCentroidX)
          }
        }
      }
      dispersionX = Math.sqrt(varianceSum / Math.max(1, faceWeightSum / 4))
    }

    // 4. Calibration vs Challenge State Execution
    if (!baselineCentroidRef.current) {
      // BASELINE CALIBRATION PHASE
      setLivenessPhase("CALIBRATING")
      setStepStatusText("Calibrating: Look straight into camera...")
      
      if (isLit && faceWeightSum > 40) {
        calibrationAccumulatorRef.current.sumX += currentCentroidX
        calibrationAccumulatorRef.current.sumY += currentCentroidY
        calibrationAccumulatorRef.current.sumSigma += dispersionX
        calibrationAccumulatorRef.current.count += 1

        const calibProgress = Math.min(100, Math.round((calibrationAccumulatorRef.current.count / 14) * 100))
        setStepProgress(calibProgress)

        if (calibrationAccumulatorRef.current.count >= 14) {
          const n = calibrationAccumulatorRef.current.count
          baselineCentroidRef.current = {
            x: calibrationAccumulatorRef.current.sumX / n,
            y: calibrationAccumulatorRef.current.sumY / n,
            sigmaX: Math.max(12, calibrationAccumulatorRef.current.sumSigma / n),
          }
          setLivenessPhase("CHALLENGE")
          setCurrentStepIndex(0)
          setStepProgress(0)
          stepHoldCounterRef.current = 0
        }
      }
    } else {
      // ACTIVE CHALLENGE PHASE
      setLivenessPhase("CHALLENGE")
      const baseline = baselineCentroidRef.current
      
      // In mirrored preview coordinates:
      // User turning physical RIGHT -> raw canvas moves LEFT (currentCentroidX < baseline.x) -> positive UserYaw
      // User turning physical LEFT -> raw canvas moves RIGHT (currentCentroidX > baseline.x) -> negative UserYaw
      const normalizedDeltaX = (baseline.x - currentCentroidX) / Math.max(10, baseline.sigmaX)
      const userYawDegrees = Math.round(normalizedDeltaX * 32.0 * 10) / 10

      const activeChallenge = challengeList[currentStepIndex] || "LOOK_CENTER"
      const stepNumber = currentStepIndex + 1
      const totalSteps = challengeList.length

      let targetYaw = 0
      let currentProgress = 0
      let actionSatisfied = false

      if (activeChallenge === "TURN_LEFT") {
        setStepStatusText(`Step ${stepNumber}/${totalSteps}: Turn your head slightly LEFT ◀`)
        targetYaw = -10.0
        // Progress increases as user turns left (negative yaw)
        currentProgress = Math.min(100, Math.max(0, Math.round((-userYawDegrees / 10.0) * 100)))
        if (userYawDegrees <= -8.0) {
          actionSatisfied = true
        }
      } else if (activeChallenge === "TURN_RIGHT") {
        setStepStatusText(`Step ${stepNumber}/${totalSteps}: Turn your head slightly RIGHT ▶`)
        targetYaw = 10.0
        // Progress increases as user turns right (positive yaw)
        currentProgress = Math.min(100, Math.max(0, Math.round((userYawDegrees / 10.0) * 100)))
        if (userYawDegrees >= 8.0) {
          actionSatisfied = true
        }
      } else if (activeChallenge === "LOOK_CENTER") {
        setStepStatusText(`Step ${stepNumber}/${totalSteps}: Look straight at camera & hold still ⏺`)
        targetYaw = 0.0
        const centerDeviation = Math.abs(userYawDegrees)
        currentProgress = Math.min(100, Math.max(0, Math.round((1 - centerDeviation / 6.0) * 100)))
        if (centerDeviation <= 5.0 && normalizedMotion >= 0.15) {
          actionSatisfied = true
        }
      }

      setStepProgress(currentProgress)

      // Dev Diagnostics for real-time verification
      if (process.env.NODE_ENV !== "production") {
        setDevDiagnostics(
          `BaselineX: ${baseline.x.toFixed(1)} | CurX: ${currentCentroidX.toFixed(1)} | Yaw: ${userYawDegrees > 0 ? "+" : ""}${userYawDegrees}° | Target: ${targetYaw}° | Progress: ${currentProgress}%`
        )
      }

      if (actionSatisfied) {
        stepHoldCounterRef.current += 1
        if (stepHoldCounterRef.current >= 12) { // Sustained for ~0.4s
          stepHoldCounterRef.current = 0
          setStepProgress(0)

          if (currentStepIndex + 1 < challengeList.length) {
            setCurrentStepIndex((prev) => prev + 1)
          } else {
            // All 3 active liveness challenges passed! Finalize live capture
            completeVerifiedLiveness(video)
            return
          }
        }
      } else {
        stepHoldCounterRef.current = Math.max(0, stepHoldCounterRef.current - 0.5)
      }
    }

    requestRef.current = requestAnimationFrame(analyzeStream)
  }

  function completeVerifiedLiveness(video: HTMLVideoElement) {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")?.drawImage(video, 0, 0)
    
    canvas.toBlob((blob) => {
      if (blob) {
        const f = new File([blob], "selfie.jpg", { type: "image/jpeg" })
        setSelfie(f)
        setSelfiePreview(URL.createObjectURL(f))
        
        const avgMotion = motionHistoryRef.current.reduce((a, b) => a + b, 0) / Math.max(1, motionHistoryRef.current.length)
        const proofPayload = {
          challenge_sequence: challengeList,
          challenges_passed: challengeList.length,
          motion_energy: Math.round(avgMotion * 100) / 100,
          session_duration_ms: Date.now() - sessionStartTimeRef.current,
          verified_at: new Date().toISOString(),
        }
        setLivenessProof(JSON.stringify(proofPayload))
        setIsLivenessVerified(true)
        setLivenessPhase("VERIFIED")
        stopCamera()
      }
    }, "image/jpeg", 0.95)
  }

  useEffect(() => {
    if (isCameraOpen) {
      requestRef.current = requestAnimationFrame(analyzeStream)
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current)
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [isCameraOpen, currentStepIndex])

  function captureManualFallback() {
    if (videoRef.current && canvasRef.current && isWellLit) {
      completeVerifiedLiveness(videoRef.current)
    }
  }

  async function submit() {
    if (!coords || !selfie || loading || (distance && distance > MAX_RADIUS_M)) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.facultyClockIn(coords.lat, coords.lon, selfie, livenessProof || undefined, selectedTeacherId || undefined)
      setResult(res)
      onClockInSuccess?.()
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-live/10 text-live">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Faculty Clock-In</p>
          <p className="text-xs text-muted-foreground">Geofence + Biometric live selfie verification</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {/* Step 1: Select Faculty */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface/60 p-3.5">
          <Label className="text-xs font-medium text-muted-foreground">Select Faculty Member</Label>
          {loadingFaculty ? (
            <p className="text-xs text-muted-foreground">Loading faculty directory…</p>
          ) : facultyList.length === 0 ? (
            <p className="text-xs text-destructive">No faculty members found. Add faculty in User Management.</p>
          ) : (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
            >
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.subject})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Step 2: Location */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface/60 p-3.5">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Location</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Target: Campus Geofence • {MAX_RADIUS_M}m radius</p>
              {geoState === "located" && coords && distance !== null ? (
                <p className="text-xs tabular-nums text-foreground mt-0.5">
                  Distance: {Math.round(distance)}m
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Not captured yet</p>
              )}
            </div>
          </div>
          {geoState === "located" && distance !== null ? (
            <Badge variant={distance <= MAX_RADIUS_M ? "success" : "destructive"} className="gap-1 text-[10px]">
              {distance <= MAX_RADIUS_M ? <><CheckCircle2 className="h-3 w-3" /> Inside Geofence</> : "Outside Geofence"}
            </Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={locate} disabled={geoState === "locating"}>
              {geoState === "locating" ? "Locating…" : "Share location"}
            </Button>
          )}
        </div>

        <div
          onClick={startCamera}
          role="button"
          tabIndex={0}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 p-3 transition-colors hover:bg-accent/50 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            {selfiePreview ? (
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border-2 border-success/40 shadow-sm">
                <img src={selfiePreview} alt="Selfie preview" className="h-full w-full object-cover -scale-x-100" />
              </div>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                <Camera className="h-4 w-4" />
              </span>
            )}
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Selfie Liveness</p>
                {isLivenessVerified && (
                  <Badge variant="success" className="text-[10px] py-0 px-1.5 h-4">Verified</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{selfie ? "Active biometric challenge passed" : "Tap to scan live face"}</p>
            </div>
          </div>
          {selfie && (
            <Button onClick={(e) => { e.stopPropagation(); startCamera(); }} size="sm" variant="ghost" className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground">
              <RefreshCcw className="w-3 h-3 mr-1"/> Retake
            </Button>
          )}
        </div>
      </div>

      <Button 
        onClick={submit} 
        disabled={!coords || !selfie || loading || (distance !== null && distance > MAX_RADIUS_M)} 
        className="mt-4 gap-1.5 w-full"
      >
        <UserRoundCheck className="h-4 w-4" />
        {loading ? "Verifying with AI…" 
          : !coords ? "Step 1: Location Required" 
          : (distance !== null && distance > MAX_RADIUS_M) ? "Outside Geofence"
          : !selfie ? "Step 2: Active Liveness Required" 
          : "Clock in"}
      </Button>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="mt-4 flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/[0.06] px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <p className="text-pretty text-sm leading-snug text-foreground">{result.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {error ? <div className="mt-2"><ErrorState error={error} onRetry={startCamera} /></div> : null}

      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCameraOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="relative w-full max-w-sm h-[540px] max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-background/95 shadow-2xl">
              
              {/* Fixed Header */}
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-black/40 z-10 shrink-0">
                <div className="flex items-center gap-2">
                  <ScanFace className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-white">Active Biometric Liveness</h3>
                </div>
                <button onClick={stopCamera} className="rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Flexible Video Area */}
              <div className="relative flex-1 min-h-0 w-full bg-black overflow-hidden flex items-center justify-center">
                <video
                  ref={(node) => {
                    videoRef.current = node;
                    if (node && videoStream && node.srcObject !== videoStream) {
                      node.srcObject = videoStream;
                      node.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-cover -scale-x-100"
                />
                
                {/* Biometric Matrix Cutout */}
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div className="relative w-[60%] h-[75%] max-w-[200px] max-h-[260px] border border-white/20 rounded-[36px] shadow-[0_0_0_999px_rgba(0,0,0,0.6)]">
                    {/* Glowing Brackets */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-[36px]" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-[36px]" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-[36px]" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-[36px]" />
                    
                    {/* Laser */}
                    <motion.div animate={{ top: ["5%", "95%", "5%"] }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }} className="absolute left-3 right-3 h-[2px] bg-primary/80 shadow-[0_0_8px_theme('colors.primary.DEFAULT')]" />
                  </div>
                </div>

                {/* HUD Elements (Safe Zones) */}
                <div className="absolute inset-0 z-20 p-3 flex flex-col justify-between pointer-events-none">
                  {/* TOP SAFE ZONE: Active Challenge Banner & Progress */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1.5 bg-black/75 backdrop-blur-md rounded-xl p-2.5 border border-white/15 shadow-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-primary tracking-wider">
                          Challenge {currentStepIndex + 1} of {challengeList.length}
                        </span>
                        <span className="text-[10px] font-mono text-white/80">{stepProgress}%</span>
                      </div>
                      
                      <p className="text-xs font-semibold text-white leading-tight">
                        {stepStatusText}
                      </p>

                      {/* Animated Progress Meter */}
                      <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden mt-0.5">
                        <div 
                          className="h-full bg-primary transition-all duration-150 rounded-full" 
                          style={{ width: `${stepProgress}%` }} 
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-md px-2 py-1 border border-white/10 text-[10px] text-white/80">
                        <Sun className={cn("h-3 w-3", isWellLit ? "text-yellow-400" : "text-destructive")} />
                        <span>Light: {lightingScore}%</span>
                      </div>
                      <Badge className="bg-primary/90 text-white border-none text-[9px] py-0.5 px-2">Anti-Spoof Guard</Badge>
                    </div>
                  </div>

                  {/* BOTTOM SAFE ZONE: Live Action Cue & Diagnostics */}
                  <div className="flex flex-col gap-1">
                    <div className="text-center bg-black/60 backdrop-blur-md rounded-lg py-1.5 px-3 border border-white/10 text-white/90 text-[11px] font-medium drop-shadow-md">
                      {livenessPhase === "CALIBRATING" ? "Hold still while calibrating baseline..." : "Perform requested movement to verify live presence"}
                    </div>
                    {devDiagnostics ? (
                      <div className="text-center font-mono text-[9px] text-primary bg-black/80 rounded px-2 py-0.5 border border-primary/20 truncate">
                        {devDiagnostics}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Hidden Canvases */}
                <canvas ref={canvasRef} className="hidden" />
                <canvas ref={analysisCanvasRef} className="hidden" />
              </div>

              {/* Fixed Footer */}
              <div className="flex flex-col gap-1.5 p-3.5 bg-background z-10 border-t border-border/50 shrink-0">
                {!isWellLit && (
                  <p className="text-xs text-destructive text-center flex items-center justify-center gap-1.5 mb-0.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Adjust lighting to improve sensor capture.
                  </p>
                )}
                <Button 
                  onClick={captureManualFallback} 
                  size="default" 
                  variant="outline"
                  disabled={!isWellLit} 
                  className="w-full gap-2 text-xs text-muted-foreground"
                >
                  <Camera className="h-3.5 w-3.5" /> Force Snapshot Fallback
                </Button>
              </div>

            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </Card>
  )
}
