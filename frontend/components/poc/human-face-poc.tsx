"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import type { Human, Config, Result, FaceResult, GestureResult } from "@vladmandic/human"
import { 
  Camera, 
  CameraOff, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ScanFace, 
  Eye, 
  Compass, 
  Activity, 
  Download, 
  UserCheck, 
  Zap, 
  Layers, 
  FlipHorizontal,
  Sparkles,
  HelpCircle
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// Conversion helper: radians to degrees
function rad2deg(rad: number): number {
  return Math.round(((rad * 180) / Math.PI) * 10) / 10
}

interface IdentitySample {
  id: string
  label: string
  timestamp: string
  descriptor: number[]
  dimensions: number
  similarity?: number
  distance?: number
}

interface AttackTestRecord {
  testId: string
  name: string
  description: string
  status: "untested" | "passed" | "failed" | "inconclusive"
  observedReal?: number | null
  observedLive?: number | null
  faceCount?: number
  notes?: string
}

const INITIAL_ATTACK_TESTS: AttackTestRecord[] = [
  { testId: "TEST_1", name: "1. Real Human Face", description: "Authentic live faculty member facing camera", status: "untested" },
  { testId: "TEST_2", name: "2. Printed Photograph", description: "Printed color photo held in front of webcam", status: "untested" },
  { testId: "TEST_3", name: "3. Phone Screen Photo", description: "High-res photo displayed on a smartphone screen", status: "untested" },
  { testId: "TEST_4", name: "4. Prerecorded Video Replay", description: "Video replay of moving face on secondary screen", status: "untested" },
  { testId: "TEST_5", name: "5. Impostor Face (Different Person)", description: "Different live individual attempting verification", status: "untested" },
  { testId: "TEST_6", name: "6. Multiple Faces in Frame", description: "Two or more people present simultaneously in webcam", status: "untested" },
]

type ChallengeStep = "LOOK_CENTER" | "TURN_LEFT" | "TURN_RIGHT" | "BLINK" | "HEAD_UP" | "HEAD_DOWN"

export function HumanFacePOC() {
  // Human instance & state
  const humanRef = useRef<Human | null>(null)
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "failed">("loading")
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [modelLoadTimeMs, setModelLoadTimeMs] = useState<number | null>(null)
  const [detectedBackend, setDetectedBackend] = useState<string>("detecting...")
  const [humanVersion, setHumanVersion] = useState<string>("")

  // Camera & Stream
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isMirrored, setIsMirrored] = useState<boolean>(true)
  const [cameraResolution, setCameraResolution] = useState<{ width: number; height: number } | null>(null)

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const requestAnimationRef = useRef<number | null>(null)

  // UI Toggles
  const [showMeshOverlay, setShowMeshOverlay] = useState<boolean>(true)
  const [showBoxOverlay, setShowBoxOverlay] = useState<boolean>(true)

  // Real-time Detection Telemetry
  const [faceCount, setFaceCount] = useState<number>(0)
  const [detectionConfidence, setDetectionConfidence] = useState<number | null>(null)
  const [boundingBox, setBoundingBox] = useState<[number, number, number, number] | null>(null)
  const [faceCenter, setFaceCenter] = useState<{ x: number; y: number } | null>(null)
  const [landmarkCount, setLandmarkCount] = useState<number>(0)
  const [irisAvailable, setIrisAvailable] = useState<boolean>(false)

  // Head Rotation (Euler Angles in Degrees)
  const [yawDeg, setYawDeg] = useState<number>(0)
  const [pitchDeg, setPitchDeg] = useState<number>(0)
  const [rollDeg, setRollDeg] = useState<number>(0)

  // Gestures
  const [gesturesList, setGesturesList] = useState<string[]>([])
  const [leftEyeStatus, setLeftEyeStatus] = useState<"OPEN" | "CLOSED">("OPEN")
  const [rightEyeStatus, setRightEyeStatus] = useState<"OPEN" | "CLOSED">("OPEN")
  const [blinkDetected, setBlinkDetected] = useState<boolean>(false)
  const [gazeDirection, setGazeDirection] = useState<string>("CENTER")

  // Anti-Spoof & Liveness
  const [realScore, setRealScore] = useState<number | null>(null)
  const [liveScore, setLiveScore] = useState<number | null>(null)

  // Performance Telemetry
  const [fps, setFps] = useState<number>(0)
  const [inferenceLatencyMs, setInferenceLatencyMs] = useState<number>(0)
  const [memoryMetric, setMemoryMetric] = useState<string>("Checking...")
  const frameTimesRef = useRef<number[]>([])

  // 1:1 Identity Matching State
  const [referenceSample, setReferenceSample] = useState<IdentitySample | null>(null)
  const [comparisonSamples, setComparisonSamples] = useState<IdentitySample[]>([])

  // Active Challenge System
  const [challengeSequence, setChallengeSequence] = useState<ChallengeStep[]>([])
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState<number>(0)
  const [challengeProgress, setChallengeProgress] = useState<number>(0)
  const [isChallengeActive, setIsChallengeActive] = useState<boolean>(false)
  const [challengePassedLog, setChallengePassedLog] = useState<string[]>([])
  const challengeHoldCountRef = useRef<number>(0)

  // Attack Tests State
  const [attackTests, setAttackTests] = useState<AttackTestRecord[]>(INITIAL_ATTACK_TESTS)

  // Diagnostic Report Export State
  const [exportedJson, setExportedJson] = useState<string | null>(null)

  // 1. Initialize Human Instance on Mount
  useEffect(() => {
    let isMounted = true

    async function initHuman() {
      try {
        setModelStatus("loading")
        setModelLoadError(null)
        const startTime = performance.now()

        // Dynamic client-side import of @vladmandic/human (aliased to browser ESM in webpack)
        const { Human } = await import("@vladmandic/human")

        const config: Partial<Config> = {
          modelBasePath: "/models",
          backend: "webgl",
          async: true,
          warmup: "face",
          cacheModels: true,
          face: {
            enabled: true,
            detector: { enabled: true, rotation: true, minConfidence: 0.25, maxDetected: 5 },
            mesh: { enabled: true },
            iris: { enabled: true },
            description: { enabled: true },
            antispoof: { enabled: true },
            liveness: { enabled: true },
            emotion: { enabled: false },
          },
          body: { enabled: false },
          hand: { enabled: false },
          object: { enabled: false },
          gesture: { enabled: true },
        }

        const humanInstance = new Human(config)
        humanRef.current = humanInstance
        setHumanVersion(humanInstance.version)

        // Preload configured models
        await humanInstance.load()
        await humanInstance.warmup()

        const elapsed = Math.round(performance.now() - startTime)
        if (isMounted) {
          setModelLoadTimeMs(elapsed)
          setModelStatus("ready")
          setDetectedBackend(humanInstance.tf?.getBackend?.() || (humanInstance.env.backends && humanInstance.env.backends[0]) || "webgl")
        }
      } catch (err: any) {
        console.error("Failed to initialize Human:", err)
        if (isMounted) {
          setModelStatus("failed")
          setModelLoadError(err?.message || "Failed to load Human AI models")
        }
      }
    }

    initHuman()

    return () => {
      isMounted = false
      if (humanRef.current) {
        try {
          humanRef.current.models.reset()
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [])

  // 2. Camera Controls
  const startCamera = async () => {
    setCameraError(null)
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError("getUserMedia is not supported by your browser")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error)
          if (videoRef.current) {
            setCameraResolution({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            })
          }
        }
      }
      setIsCameraActive(true)
    } catch (err: any) {
      console.error("Camera access error:", err)
      setCameraError(err?.message || "Failed to access webcam. Check browser permissions.")
      setIsCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    if (requestAnimationRef.current) {
      cancelAnimationFrame(requestAnimationRef.current)
      requestAnimationRef.current = null
    }
    setIsCameraActive(false)
    resetTelemetry()
  }

  const resetTelemetry = () => {
    setFaceCount(0)
    setDetectionConfidence(null)
    setBoundingBox(null)
    setFaceCenter(null)
    setLandmarkCount(0)
    setIrisAvailable(false)
    setYawDeg(0)
    setPitchDeg(0)
    setRollDeg(0)
    setGesturesList([])
    setRealScore(null)
    setLiveScore(null)
    setLeftEyeStatus("OPEN")
    setRightEyeStatus("OPEN")
    setBlinkDetected(false)
  }

  // 3. Continuous Detection Loop
  const runDetection = useCallback(async () => {
    const video = videoRef.current
    const canvas = overlayCanvasRef.current
    const human = humanRef.current

    if (!video || !canvas || !human || video.readyState < 2 || !isCameraActive) {
      if (isCameraActive) {
        requestAnimationRef.current = requestAnimationFrame(runDetection)
      }
      return
    }

    // Sync canvas dimensions
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
    }

    const startTime = performance.now()

    try {
      const result: Result = await human.detect(video)
      const latency = Math.round(performance.now() - startTime)
      setInferenceLatencyMs(latency)

      // FPS tracking
      const now = performance.now()
      frameTimesRef.current.push(now)
      while (frameTimesRef.current.length > 0 && frameTimesRef.current[0] <= now - 1000) {
        frameTimesRef.current.shift()
      }
      setFps(frameTimesRef.current.length)

      // Check Memory Metrics
      if (typeof window !== "undefined" && (performance as any)?.memory?.usedJSHeapSize) {
        const usedMB = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024))
        setMemoryMetric(`${usedMB} MB (JS Heap)`)
      } else {
        setMemoryMetric("Memory metrics unavailable in this browser")
      }

      // Draw overlay
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (showMeshOverlay || showBoxOverlay) {
          human.draw.face(canvas, result.face, {
            drawPoints: showMeshOverlay,
            drawBoxes: showBoxOverlay,
            drawPolygons: showMeshOverlay,
            drawAttention: showMeshOverlay,
            drawGaze: true,
            lineWidth: 2,
            pointSize: 1,
          })
        }
      }

      // Process Face Telemetry
      const faces: FaceResult[] = result.face || []
      setFaceCount(faces.length)

      if (faces.length > 0) {
        const primaryFace = faces[0]
        setDetectionConfidence(Math.round(primaryFace.boxScore * 100) / 100)
        setBoundingBox(primaryFace.box)

        const [bx, by, bw, bh] = primaryFace.box
        setFaceCenter({ x: Math.round(bx + bw / 2), y: Math.round(by + bh / 2) })

        if (primaryFace.mesh) {
          setLandmarkCount(primaryFace.mesh.length)
        }
        setIrisAvailable(Boolean(primaryFace.annotations?.leftEyeIris || primaryFace.annotations?.rightEyeIris))

        // Rotation angles: convert from radians to degrees
        if (primaryFace.rotation?.angle) {
          const rawYaw = rad2deg(primaryFace.rotation.angle.yaw)
          const rawPitch = rad2deg(primaryFace.rotation.angle.pitch)
          const rawRoll = rad2deg(primaryFace.rotation.angle.roll)
          setYawDeg(rawYaw)
          setPitchDeg(rawPitch)
          setRollDeg(rawRoll)

          // Gaze direction
          if (Math.abs(rawYaw) > 15) {
            setGazeDirection(rawYaw > 0 ? "RIGHT" : "LEFT")
          } else if (Math.abs(rawPitch) > 12) {
            setGazeDirection(rawPitch > 0 ? "UP" : "DOWN")
          } else {
            setGazeDirection("CENTER")
          }
        }

        // Anti-spoof & Liveness
        setRealScore(typeof primaryFace.real === "number" ? Math.round(primaryFace.real * 100) / 100 : null)
        setLiveScore(typeof primaryFace.live === "number" ? Math.round(primaryFace.live * 100) / 100 : null)

        // Gestures
        const gestures = (result.gesture || []).map((g: GestureResult) => g.gesture)
        setGesturesList(gestures)

        const leftBlink = gestures.some((g) => g.includes("blink left"))
        const rightBlink = gestures.some((g) => g.includes("blink right"))
        setLeftEyeStatus(leftBlink ? "CLOSED" : "OPEN")
        setRightEyeStatus(rightBlink ? "CLOSED" : "OPEN")
        setBlinkDetected(leftBlink || rightBlink)

        // Process Active Challenges if running
        if (isChallengeActive && challengeSequence.length > 0) {
          processChallengeStep(primaryFace, gestures)
        }
      } else {
        resetTelemetry()
      }
    } catch (detectErr) {
      console.warn("Detection frame error:", detectErr)
    }

    if (isCameraActive) {
      requestAnimationRef.current = requestAnimationFrame(runDetection)
    }
  }, [isCameraActive, showMeshOverlay, showBoxOverlay, isChallengeActive, challengeSequence, currentChallengeIndex])

  useEffect(() => {
    if (isCameraActive) {
      requestAnimationRef.current = requestAnimationFrame(runDetection)
    }
    return () => {
      if (requestAnimationRef.current) {
        cancelAnimationFrame(requestAnimationRef.current)
      }
    }
  }, [isCameraActive, runDetection])

  // 4. Active Challenge Logic
  const startChallengeSuite = () => {
    const possible: ChallengeStep[] = ["TURN_RIGHT", "TURN_LEFT", "BLINK", "LOOK_CENTER"]
    const shuffled = [...possible].sort(() => Math.random() - 0.5).slice(0, 3)
    setChallengeSequence(shuffled)
    setCurrentChallengeIndex(0)
    setChallengeProgress(0)
    setChallengePassedLog([])
    challengeHoldCountRef.current = 0
    setIsChallengeActive(true)
  }

  const stopChallengeSuite = () => {
    setIsChallengeActive(false)
    setChallengeProgress(0)
    challengeHoldCountRef.current = 0
  }

  const processChallengeStep = (face: FaceResult, gestures: string[]) => {
    const currentStep = challengeSequence[currentChallengeIndex]
    if (!currentStep) return

    const curYaw = face.rotation?.angle ? rad2deg(face.rotation.angle.yaw) : 0
    const curPitch = face.rotation?.angle ? rad2deg(face.rotation.angle.pitch) : 0
    let stepProgress = 0
    let isSatisfied = false

    if (currentStep === "TURN_RIGHT") {
      // Progress 0% to 100% as yaw approaches +15 degrees
      stepProgress = Math.min(100, Math.max(0, Math.round((curYaw / 15.0) * 100)))
      if (curYaw >= 12.0) isSatisfied = true
    } else if (currentStep === "TURN_LEFT") {
      // Progress 0% to 100% as yaw approaches -15 degrees
      stepProgress = Math.min(100, Math.max(0, Math.round((-curYaw / 15.0) * 100)))
      if (curYaw <= -12.0) isSatisfied = true
    } else if (currentStep === "LOOK_CENTER") {
      const dev = Math.abs(curYaw) + Math.abs(curPitch)
      stepProgress = Math.min(100, Math.max(0, Math.round((1 - dev / 10.0) * 100)))
      if (Math.abs(curYaw) <= 5.0 && Math.abs(curPitch) <= 5.0) isSatisfied = true
    } else if (currentStep === "BLINK") {
      const isBlinking = gestures.some((g) => g.includes("blink"))
      stepProgress = isBlinking ? 100 : 0
      if (isBlinking) isSatisfied = true
    } else if (currentStep === "HEAD_UP") {
      stepProgress = Math.min(100, Math.max(0, Math.round((curPitch / 12.0) * 100)))
      if (curPitch >= 10.0) isSatisfied = true
    } else if (currentStep === "HEAD_DOWN") {
      stepProgress = Math.min(100, Math.max(0, Math.round((-curPitch / 12.0) * 100)))
      if (curPitch <= -10.0) isSatisfied = true
    }

    setChallengeProgress(stepProgress)

    if (isSatisfied) {
      challengeHoldCountRef.current += 1
      if (challengeHoldCountRef.current >= 8) { // ~250ms hold
        challengeHoldCountRef.current = 0
        setChallengePassedLog((prev) => [...prev, `${currentStep} (Passed with yaw: ${curYaw}°, pitch: ${curPitch}°)`])
        
        if (currentChallengeIndex + 1 < challengeSequence.length) {
          setCurrentChallengeIndex((prev) => prev + 1)
          setChallengeProgress(0)
        } else {
          setIsChallengeActive(false)
          setChallengeProgress(100)
        }
      }
    } else {
      challengeHoldCountRef.current = Math.max(0, challengeHoldCountRef.current - 0.5)
    }
  }

  // 5. 1:1 Identity Matching Handlers
  const captureReference = async () => {
    if (!humanRef.current || !videoRef.current || faceCount !== 1) return
    try {
      const res = await humanRef.current.detect(videoRef.current)
      const embedding = res.face[0]?.embedding
      if (embedding && embedding.length > 0) {
        const sample: IdentitySample = {
          id: `ref-${Date.now()}`,
          label: "Enrolled Reference Face",
          timestamp: new Date().toLocaleTimeString(),
          descriptor: Array.from(embedding),
          dimensions: embedding.length,
        }
        setReferenceSample(sample)
      }
    } catch (e) {
      console.error("Failed to capture reference:", e)
    }
  }

  const captureLiveAndCompare = async (label: string) => {
    if (!humanRef.current || !videoRef.current || faceCount !== 1 || !referenceSample) return
    try {
      const res = await humanRef.current.detect(videoRef.current)
      const liveEmbedding = res.face[0]?.embedding
      if (liveEmbedding && liveEmbedding.length > 0) {
        const sim = humanRef.current.match.similarity(referenceSample.descriptor, Array.from(liveEmbedding), { order: 2 })
        const dist = humanRef.current.match.distance(referenceSample.descriptor, Array.from(liveEmbedding), { order: 2 })

        const newSample: IdentitySample = {
          id: `live-${Date.now()}`,
          label,
          timestamp: new Date().toLocaleTimeString(),
          descriptor: Array.from(liveEmbedding),
          dimensions: liveEmbedding.length,
          similarity: Math.round(sim * 1000) / 1000,
          distance: Math.round(dist * 1000) / 1000,
        }

        setComparisonSamples((prev) => [newSample, ...prev.slice(0, 4)])
      }
    } catch (e) {
      console.error("Failed to capture live compare:", e)
    }
  }

  // 6. Manual Attack Checklist Action
  const recordAttackTestResult = (testId: string, status: "passed" | "failed" | "inconclusive", notes?: string) => {
    setAttackTests((prev) =>
      prev.map((t) =>
        t.testId === testId
          ? {
              ...t,
              status,
              observedReal: realScore,
              observedLive: liveScore,
              faceCount,
              notes: notes || t.notes,
            }
          : t
      )
    )
  }

  // 7. Diagnostic Report Exporter
  const generateDiagnosticReport = () => {
    const report = {
      title: "CampusNova Face AI Research POC Diagnostic Report",
      generatedAt: new Date().toISOString(),
      disclaimer: "RESEARCH SIGNAL REPORT — NOT CONNECTED TO PRODUCTION ATTENDANCE",
      environment: {
        humanVersion,
        backendUsed: detectedBackend,
        modelLoadTimeMs,
        cameraResolution,
        fps,
        inferenceLatencyMs,
        memoryMetric,
      },
      liveFaceDetectionMetrics: {
        faceCount,
        detectionConfidence,
        boundingBox,
        faceCenter,
        landmarkCount,
        irisAvailable,
      },
      headPoseAnglesDegrees: {
        yaw: yawDeg,
        pitch: pitchDeg,
        roll: rollDeg,
        gazeDirection,
      },
      gesturesObserved: gesturesList,
      antiSpoofLivenessSignals: {
        realScore: realScore ?? "N/A",
        liveScore: liveScore ?? "N/A",
        note: "Raw statistical inference score. Not a physical sensor guarantee.",
      },
      identityVerificationTests: {
        referenceEnrolled: Boolean(referenceSample),
        referenceDimensions: referenceSample?.dimensions || 0,
        comparisonHistory: comparisonSamples.map((s) => ({
          label: s.label,
          timestamp: s.timestamp,
          similarity: s.similarity,
          distance: s.distance,
        })),
      },
      activeChallengesCompleted: challengePassedLog,
      presentationAttackManualResults: attackTests,
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `campusnova-face-ai-poc-report-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportedJson(JSON.stringify(report, null, 2))
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-16">
      
      {/* Banner */}
      <div className="rounded-2xl border-2 border-primary/40 bg-card p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <ScanFace className="w-48 h-48" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="border-primary/50 text-primary uppercase tracking-widest text-[10px] font-bold">
                Research Prototype
              </Badge>
              <Badge variant="destructive" className="text-[10px]">
                NOT CONNECTED TO PRODUCTION ATTENDANCE
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              CampusNova Face AI Research POC
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Standalone evaluation of <span className="font-mono text-foreground font-semibold">@vladmandic/human v{humanVersion || "3.3.6"}</span> for 3D head pose tracking, active challenge verification, passive anti-spoofing, and 1:1 facial identity embeddings.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {modelStatus === "ready" ? (
              <Badge variant="success" className="gap-1.5 py-1.5 px-3">
                <CheckCircle2 className="w-4 h-4" /> Models Ready ({detectedBackend})
              </Badge>
            ) : modelStatus === "loading" ? (
              <Badge variant="neutral" className="gap-1.5 py-1.5 px-3 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading Local Models...
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5 py-1.5 px-3">
                <XCircle className="w-4 h-4" /> Model Load Failed
              </Badge>
            )}
          </div>
        </div>
      </div>

      {modelLoadError && (
        <Card className="p-4 border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold">Model Initialization Error</p>
            <p>{modelLoadError}</p>
          </div>
        </Card>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Camera & Overlay Canvas (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Live Webcam View</h3>
              </div>
              {cameraResolution && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {cameraResolution.width}×{cameraResolution.height}
                </span>
              )}
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-[4/3] w-full bg-black rounded-xl overflow-hidden border border-border shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover ${isMirrored ? "-scale-x-100" : ""}`}
              />
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none ${isMirrored ? "-scale-x-100" : ""}`}
              />

              {!isCameraActive && (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
                  <CameraOff className="w-10 h-10 stroke-1" />
                  <p className="text-xs">Webcam is currently idle. Click below to start.</p>
                </div>
              )}

              {/* Live Overlay HUD Warning for Face Count */}
              {isCameraActive && (
                <div className="absolute top-2 left-2 z-10">
                  {faceCount === 1 ? (
                    <Badge variant="success" className="text-[10px] bg-black/60 backdrop-blur-sm border-success/40">
                      1 Face Detected
                    </Badge>
                  ) : faceCount === 0 ? (
                    <Badge variant="destructive" className="text-[10px] bg-black/60 backdrop-blur-sm">
                      No Face Detected
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px] bg-black/60 backdrop-blur-sm animate-pulse">
                      ⚠️ Multiple Faces ({faceCount})
                    </Badge>
                  )}
                </div>
              )}

              {/* Live FPS Tag */}
              {isCameraActive && (
                <div className="absolute top-2 right-2 z-10">
                  <span className="bg-black/60 backdrop-blur-sm text-primary font-mono text-[10px] px-2 py-0.5 rounded border border-primary/30">
                    {fps} FPS | {inferenceLatencyMs}ms
                  </span>
                </div>
              )}
            </div>

            {/* Camera Controls */}
            <div className="flex items-center gap-2 pt-1">
              {!isCameraActive ? (
                <Button 
                  onClick={startCamera} 
                  disabled={modelStatus !== "ready"} 
                  className="flex-1 gap-2"
                >
                  <Camera className="w-4 h-4" /> Start Camera
                </Button>
              ) : (
                <Button 
                  onClick={stopCamera} 
                  variant="destructive" 
                  className="flex-1 gap-2"
                >
                  <CameraOff className="w-4 h-4" /> Stop Camera
                </Button>
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsMirrored(!isMirrored)}
                title="Toggle Horizontal Mirror"
              >
                <FlipHorizontal className="w-4 h-4" />
              </Button>
            </div>

            {cameraError && (
              <p className="text-xs text-destructive mt-1 font-medium">{cameraError}</p>
            )}

            {/* Visual Mesh Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={showMeshOverlay}
                  onChange={(e) => setShowMeshOverlay(e.target.checked)}
                  className="rounded border-border"
                />
                Draw 468-pt Mesh
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={showBoxOverlay}
                  onChange={(e) => setShowBoxOverlay(e.target.checked)}
                  className="rounded border-border"
                />
                Draw Bounding Box
              </label>
            </div>
          </Card>

          {/* Performance Card */}
          <Card className="p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" /> Performance & Engine
              </span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {detectedBackend}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-surface/50 border border-border">
                <p className="text-muted-foreground text-[10px]">Inference Rate</p>
                <p className="text-sm font-mono font-bold text-foreground">{fps} FPS</p>
              </div>
              <div className="p-2 rounded-lg bg-surface/50 border border-border">
                <p className="text-muted-foreground text-[10px]">Latency</p>
                <p className="text-sm font-mono font-bold text-foreground">{inferenceLatencyMs} ms</p>
              </div>
              <div className="p-2 rounded-lg bg-surface/50 border border-border">
                <p className="text-muted-foreground text-[10px]">Model Load Time</p>
                <p className="text-sm font-mono font-semibold text-foreground">{modelLoadTimeMs ? `${modelLoadTimeMs} ms` : "N/A"}</p>
              </div>
              <div className="p-2 rounded-lg bg-surface/50 border border-border">
                <p className="text-muted-foreground text-[10px]">Memory Footprint</p>
                <p className="text-[11px] font-mono text-foreground truncate" title={memoryMetric}>{memoryMetric}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Real-Time Telemetry & Gauges (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* Card: 3D Head Rotation (Euler Angles) */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">3D Head Pose & Rotation</h3>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-primary font-bold">Yaw: {yawDeg > 0 ? `+${yawDeg}` : yawDeg}°</span>
                <span className="text-muted-foreground">Pitch: {pitchDeg}°</span>
                <span className="text-muted-foreground">Roll: {rollDeg}°</span>
              </div>
            </div>

            {/* Rotation Progress Meters */}
            <div className="flex flex-col gap-2.5">
              {/* Looking Center */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Looking Center (Yaw: -5° to +5°)</span>
                  <span className="font-mono font-medium">
                    {Math.abs(yawDeg) <= 5 ? "100%" : `${Math.max(0, Math.round((1 - Math.abs(yawDeg) / 15) * 100))}%`}
                  </span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-75"
                    style={{ width: `${Math.abs(yawDeg) <= 5 ? 100 : Math.max(0, (1 - Math.abs(yawDeg) / 15) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Turn LEFT */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Turn LEFT (Yaw: ≤ -15°)</span>
                  <span className="font-mono font-medium">
                    {yawDeg < 0 ? `${Math.min(100, Math.round((-yawDeg / 15) * 100))}%` : "0%"}
                  </span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-75"
                    style={{ width: `${yawDeg < 0 ? Math.min(100, (-yawDeg / 15) * 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* Turn RIGHT */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Turn RIGHT (Yaw: ≥ +15°)</span>
                  <span className="font-mono font-medium">
                    {yawDeg > 0 ? `${Math.min(100, Math.round((yawDeg / 15) * 100))}%` : "0%"}
                  </span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-75"
                    style={{ width: `${yawDeg > 0 ? Math.min(100, (yawDeg / 15) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Card: Blink, Gaze & Gestures */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Blink, Gaze & Gesture Recognition</h3>
              </div>
              <Badge variant={blinkDetected ? "success" : "outline"} className="text-[10px]">
                {blinkDetected ? "Blink Detected" : "Eyes Open"}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface/50 border border-border flex flex-col items-center">
                <span className="text-muted-foreground text-[10px]">Left Eye</span>
                <span className={`font-semibold mt-0.5 ${leftEyeStatus === "CLOSED" ? "text-primary" : "text-foreground"}`}>
                  {leftEyeStatus}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface/50 border border-border flex flex-col items-center">
                <span className="text-muted-foreground text-[10px]">Right Eye</span>
                <span className={`font-semibold mt-0.5 ${rightEyeStatus === "CLOSED" ? "text-primary" : "text-foreground"}`}>
                  {rightEyeStatus}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface/50 border border-border flex flex-col items-center">
                <span className="text-muted-foreground text-[10px]">Gaze Bearing</span>
                <span className="font-semibold text-primary mt-0.5">{gazeDirection}</span>
              </div>
            </div>

            {/* Raw Gestures Returned */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground text-[11px] shrink-0">Raw Gestures:</span>
              <div className="flex flex-wrap gap-1">
                {gesturesList.length > 0 ? (
                  gesturesList.map((g, idx) => (
                    <Badge key={idx} variant="neutral" className="text-[9px] font-mono py-0">
                      {g}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-[11px] italic">None active</span>
                )}
              </div>
            </div>
          </Card>

          {/* Card: Anti-Spoof & Liveness Signal Gauges */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Passive Anti-Spoof & Liveness Signals</h3>
              </div>
              <span className="text-[10px] text-muted-foreground italic">Research Telemetry</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Real / Anti-Spoof Score */}
              <div className="p-3 rounded-xl bg-surface/50 border border-border flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium">Real (Anti-Spoof) Score</span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {realScore !== null ? realScore.toFixed(2) : "N/A"}
                  </span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 ${
                      realScore !== null && realScore >= 0.7 ? "bg-success" : "bg-destructive"
                    }`}
                    style={{ width: `${realScore !== null ? realScore * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {realScore !== null
                    ? realScore >= 0.7
                      ? "Score indicates natural skin texture"
                      : "Score indicates presentation anomaly"
                    : "Awaiting face..."}
                </p>
              </div>

              {/* Liveness Score */}
              <div className="p-3 rounded-xl bg-surface/50 border border-border flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium">Liveness Score</span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {liveScore !== null ? liveScore.toFixed(2) : "N/A"}
                  </span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 ${
                      liveScore !== null && liveScore >= 0.7 ? "bg-success" : "bg-destructive"
                    }`}
                    style={{ width: `${liveScore !== null ? liveScore * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {liveScore !== null
                    ? liveScore >= 0.7
                      ? "Score indicates live presence"
                      : "Score indicates replay/display artifact"
                    : "Awaiting face..."}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-surface/30 p-2 border border-border/40 text-[10px] text-muted-foreground flex items-start gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>
                <strong>Research signal — NOT a guaranteed presentation attack detector.</strong> In production, passive signals must be paired with dynamic challenges and geofencing.
              </span>
            </div>
          </Card>

          {/* Card: 1:1 Face Identity Vector Matching */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">1:1 Face Identity Vector Matching</h3>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {referenceSample ? `${referenceSample.dimensions}D Vector` : "No Reference"}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={captureReference}
                disabled={!isCameraActive || faceCount !== 1}
                size="sm"
                variant="outline"
                className="text-xs gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-primary" /> 1. Capture Reference Face
              </Button>

              <Button
                onClick={() => captureLiveAndCompare("Same Person (Live)")}
                disabled={!isCameraActive || faceCount !== 1 || !referenceSample}
                size="sm"
                className="text-xs gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5" /> 2. Test Same Person
              </Button>

              <Button
                onClick={() => captureLiveAndCompare("Different Person / Impostor")}
                disabled={!isCameraActive || faceCount !== 1 || !referenceSample}
                size="sm"
                variant="destructive"
                className="text-xs gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> 3. Test Impostor
              </Button>
            </div>

            {/* Comparison History Table */}
            {comparisonSamples.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Recent In-Memory Matches:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[10px] text-muted-foreground uppercase bg-surface/60">
                      <tr>
                        <th className="py-1 px-2">Label</th>
                        <th className="py-1 px-2">Time</th>
                        <th className="py-1 px-2">Similarity</th>
                        <th className="py-1 px-2">Distance</th>
                        <th className="py-1 px-2">Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonSamples.map((sample) => {
                        const sim = sample.similarity ?? 0
                        const isMatch = sim >= 0.65
                        return (
                          <tr key={sample.id} className="border-b border-border/30 hover:bg-surface/30">
                            <td className="py-1 px-2 font-medium">{sample.label}</td>
                            <td className="py-1 px-2 text-muted-foreground font-mono">{sample.timestamp}</td>
                            <td className="py-1 px-2 font-mono font-bold">{sim.toFixed(3)}</td>
                            <td className="py-1 px-2 font-mono">{sample.distance?.toFixed(3) ?? "N/A"}</td>
                            <td className="py-1 px-2">
                              <Badge variant={isMatch ? "success" : "destructive"} className="text-[9px] py-0">
                                {isMatch ? "Match (≥0.65)" : "Mismatch (<0.65)"}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

        </div>
      </div>

      {/* BOTTOM SECTION: Active Challenge Engine & Attack Testing Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Active Challenge Tester (6 cols) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <Card className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Active Challenge Sequence Prototype</h3>
              </div>
              {isChallengeActive ? (
                <Badge variant="success" className="text-[10px] animate-pulse">Running</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Idle</Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Evaluates whether Human's 3D angles and gestures provide reliable real-time triggers for randomized liveness challenges without false stalls.
            </p>

            {!isChallengeActive ? (
              <Button
                onClick={startChallengeSuite}
                disabled={!isCameraActive || faceCount !== 1}
                className="w-full gap-2"
              >
                <Sparkles className="w-4 h-4" /> Start Randomized 3-Step Challenge
              </Button>
            ) : (
              <div className="flex flex-col gap-3 bg-surface/60 rounded-xl p-4 border border-primary/30">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-primary">
                    Step {currentChallengeIndex + 1} of {challengeSequence.length}: {challengeSequence[currentChallengeIndex]}
                  </span>
                  <span className="font-mono font-semibold">{challengeProgress}%</span>
                </div>

                <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-100 rounded-full"
                    style={{ width: `${challengeProgress}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                  <span>Hold target position for ~0.3s</span>
                  <Button size="sm" variant="ghost" onClick={stopChallengeSuite} className="h-6 text-xs text-destructive">
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Challenge Pass Log */}
            {challengePassedLog.length > 0 && (
              <div className="flex flex-col gap-1 text-xs">
                <p className="text-[11px] font-semibold text-muted-foreground">Completed Challenges:</p>
                <div className="flex flex-col gap-1">
                  {challengePassedLog.map((log, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-success text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Attack Testing Checklist & Export (6 cols) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <Card className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Presentation Attack Test Checklist</h3>
              </div>
              <Button size="sm" variant="outline" onClick={generateDiagnosticReport} className="gap-1.5 text-xs">
                <Download className="w-3.5 h-3.5" /> Export Diagnostic Report
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {attackTests.map((test) => (
                <div
                  key={test.testId}
                  className="p-2.5 rounded-xl border border-border bg-surface/40 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{test.name}</span>
                    <span className="text-[10px] text-muted-foreground">{test.description}</span>
                    {test.observedReal !== undefined && test.observedReal !== null && (
                      <span className="text-[10px] font-mono text-primary mt-0.5">
                        Recorded: Real={test.observedReal} | Live={test.observedLive ?? "N/A"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant={test.status === "passed" ? "default" : "outline"}
                      onClick={() => recordAttackTestResult(test.testId, "passed")}
                      className="h-7 text-[10px] px-2"
                    >
                      Pass
                    </Button>
                    <Button
                      size="sm"
                      variant={test.status === "failed" ? "destructive" : "outline"}
                      onClick={() => recordAttackTestResult(test.testId, "failed")}
                      className="h-7 text-[10px] px-2"
                    >
                      Fail
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

      </div>

      {/* JSON Report Preview Modal/Drawer (if exported) */}
      {exportedJson && (
        <Card className="p-4 bg-black/90 text-primary font-mono text-xs overflow-x-auto max-h-60">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-white">Diagnostic Report JSON Preview:</span>
            <Button size="sm" variant="ghost" onClick={() => setExportedJson(null)} className="h-6 text-xs text-white">
              Dismiss
            </Button>
          </div>
          <pre>{exportedJson}</pre>
        </Card>
      )}

    </div>
  )
}
