"use client"

import dynamic from "next/dynamic"
import { ScanFace } from "lucide-react"

// Dynamic import with SSR disabled to guarantee browser-only execution for TensorFlow / WebGL
const HumanFacePOC = dynamic(
  () => import("@/components/poc/human-face-poc").then((mod) => mod.HumanFacePOC),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <ScanFace className="w-10 h-10 animate-pulse text-primary" />
        <p className="text-sm font-medium">Initializing CampusNova Face AI Research POC...</p>
      </div>
    ),
  }
)

export default function FaceAITestPage() {
  return (
    <main className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <HumanFacePOC />
      </div>
    </main>
  )
}
