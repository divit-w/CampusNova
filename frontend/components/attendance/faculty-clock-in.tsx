"use client"

import { useRef, useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Camera, CheckCircle2, MapPin, ShieldCheck, UserRoundCheck, X, RefreshCcw, Sun, ScanFace, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

export function FacultyClockIn() {
  const [geoState, setGeoState] = useState<GeoState>("idle")
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ClockInResponse | null>(null)
  const [error, setError] = useState<unknown>(null)

  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
  
  // Edge AI States
  const [lightingScore, setLightingScore] = useState<number>(0)
  const [isWellLit, setIsWellLit] = useState<boolean>(true)
  const [faceBox, setFaceBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [faceSupported, setFaceSupported] = useState<boolean>(true)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null)
  const requestRef = useRef<number>()

  function locate() {
    if (!navigator.geolocation) {
      setGeoState("denied")
      return
    }
    setGeoState("locating")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        setCoords({ lat, lon })
        setDistance(getDistance(lat, lon, TARGET_LAT, TARGET_LON))
        setGeoState("located")
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }

  async function startCamera() {
    setSelfie(null)
    setSelfiePreview(null)
    setError(null)
    setResult(null)
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(new Error("Camera blocked or secure context missing."))
      return
    }
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } } })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
      }
      setVideoStream(stream)
      setIsCameraOpen(true)
    } catch (err: any) {
      console.warn("Camera failed", err)
      setError(new Error("Camera permission denied."))
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

  // EDGE AI LOOP
  const analyzeStream = async () => {
    const video = videoRef.current
    const canvas = analysisCanvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      requestRef.current = requestAnimationFrame(analyzeStream)
      return
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // 1. Lighting Quality Engine (Luminance check via downsampling)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let brightnessSum = 0
    let pixelCount = 0
    for (let i = 0; i < imageData.length; i += 16) {
      brightnessSum += 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]
      pixelCount++
    }
    const avgBrightness = brightnessSum / pixelCount
    const score = Math.min(100, Math.round((avgBrightness / 255) * 100))
    setLightingScore(score)
    setIsWellLit(score >= 30 && score <= 85)

    // 2. Hardware FaceDetector API
    if ("FaceDetector" in window) {
      setFaceSupported(true)
      try {
        // @ts-ignore
        const faceDetector = new window.FaceDetector()
        const faces = await faceDetector.detect(video)
        if (faces.length > 0) {
          const box = faces[0].boundingBox
          setFaceBox({
            top: (box.top / video.videoHeight) * 100,
            left: (box.left / video.videoWidth) * 100,
            width: (box.width / video.videoWidth) * 100,
            height: (box.height / video.videoHeight) * 100,
          })
        } else {
          setFaceBox(null)
        }
      } catch (e) {
        setFaceSupported(false) // Fallback if API crashes
      }
    } else {
      setFaceSupported(false)
    }

    requestRef.current = requestAnimationFrame(analyzeStream)
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
  }, [isCameraOpen])

  function capturePhoto() {
    if (videoRef.current && canvasRef.current && isWellLit && (faceBox || !faceSupported)) {
      const video = videoRef.current
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext("2d")?.drawImage(video, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) {
          const f = new File([blob], "selfie.jpg", { type: "image/jpeg" })
          setSelfie(f)
          setSelfiePreview(URL.createObjectURL(f))
          stopCamera()
        }
      }, "image/jpeg", 0.9)
    }
  }

  async function submit() {
    if (!coords || !selfie || loading || (distance && distance > MAX_RADIUS_M)) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.facultyClockIn(coords.lat, coords.lon, selfie)
      setResult(res)
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
          <p className="text-sm font-semibold leading-tight">Faculty clock-in</p>
          <p className="text-xs text-muted-foreground">Geofence + Edge AI liveness check</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface/60 p-3.5">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Location</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Target: JIIT Campus ({TARGET_LAT}, {TARGET_LON}) • {MAX_RADIUS_M}m radius</p>
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
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border-2 border-primary/20 shadow-sm">
                <img src={selfiePreview} alt="Selfie preview" className="h-full w-full object-cover -scale-x-100" />
              </div>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                <Camera className="h-4 w-4" />
              </span>
            )}
            <div className="flex flex-col justify-center">
              <p className="text-sm font-medium">Selfie Liveness</p>
              <p className="text-xs text-muted-foreground">{selfie ? "Biometric lock acquired" : "Tap to scan face"}</p>
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
          : !selfie ? "Step 2: Selfie Required" 
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

      <AnimatePresence>
        {isCameraOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="relative w-full max-w-sm h-[520px] max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-background/95 shadow-2xl">
              
              {/* Fixed Header */}
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-black/40 z-10 shrink-0">
                <div className="flex items-center gap-2">
                  <ScanFace className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-white">Edge AI HUD</h3>
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
                    if (node && videoStream && node.srcObject !== videoStream) node.srcObject = videoStream;
                  }}
                  autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover -scale-x-100"
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
                    <motion.div animate={{ top: ["5%", "95%", "5%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute left-3 right-3 h-[2px] bg-primary/80 shadow-[0_0_8px_theme('colors.primary.DEFAULT')]" />
                  </div>
                </div>

                {/* HUD Elements (Safe Zones) */}
                <div className="absolute inset-0 z-20 p-3 flex flex-col justify-between pointer-events-none">
                  {/* TOP SAFE ZONE: Badges & Luminance */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between bg-black/60 backdrop-blur-md rounded-lg p-2 border border-white/10">
                      <div className="flex items-center gap-2">
                        <Sun className={cn("h-4 w-4", isWellLit ? "text-yellow-400" : "text-destructive")} />
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase font-bold text-white/70 tracking-wider">Luminance (30-85%)</span>
                          <span className={cn("text-[11px] font-medium leading-tight", isWellLit ? "text-white" : "text-destructive")}>
                            {lightingScore}% {isWellLit ? "Optimal" : "Adjust Lighting"}
                          </span>
                        </div>
                      </div>
                      <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden shrink-0">
                        <div className={cn("h-full transition-all duration-300", isWellLit ? "bg-success" : "bg-destructive")} style={{ width: `${lightingScore}%` }} />
                      </div>
                    </div>
                    
                    <div className="self-center">
                      {!faceSupported ? (
                        <Badge className="bg-primary/80 text-white border-none backdrop-blur-md text-[10px] py-0.5">Edge Lighting AI Active</Badge>
                      ) : faceBox ? (
                        <Badge className="bg-success text-white border-none backdrop-blur-md text-[10px] py-0.5">Face Locked</Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-destructive text-white border-none backdrop-blur-md animate-pulse text-[10px] py-0.5">Scanning...</Badge>
                      )}
                    </div>
                  </div>

                  {/* BOTTOM SAFE ZONE: Text */}
                  <div className="text-center text-white/80 text-[10px] font-bold tracking-[0.2em] uppercase drop-shadow-md">
                    Position Face Within Frame
                  </div>
                </div>

                {/* Hidden Canvases */}
                <canvas ref={canvasRef} className="hidden" />
                <canvas ref={analysisCanvasRef} className="hidden" />
              </div>

              {/* Fixed Footer / Capture Button */}
              <div className="flex flex-col gap-1.5 p-3.5 bg-background z-10 border-t border-border/50 shrink-0">
                {!isWellLit && (
                  <p className="text-xs text-destructive text-center flex items-center justify-center gap-1.5 mb-0.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Room is too dark. Adjust lighting to capture.
                  </p>
                )}
                <Button 
                  onClick={capturePhoto} 
                  size="default" 
                  disabled={!isWellLit || (faceSupported && !faceBox)} 
                  className="w-full gap-2 font-semibold"
                >
                  <Camera className="h-4 w-4" /> 
                  {!isWellLit ? "Lighting Poor" : (faceSupported && !faceBox) ? "Align Face" : "Capture Lock"}
                </Button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
