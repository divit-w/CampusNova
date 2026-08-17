"use client"

import { useRef, useState } from "react"
import { UploadCloud, CheckCircle2, Clock, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

type QueueItem = {
  id: string
  file: File
  status: "pending" | "processing" | "verified" | "error"
  progress: number
  error?: string
}

export function DocumentUpload() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePickFiles = (files: FileList | null) => {
    if (!files) return
    const newItems: QueueItem[] = Array.from(files).map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: "pending",
      progress: 0,
    }))
    setQueue((prev) => [...prev, ...newItems])
  }

  const handleJudgeSample = async (level: 1 | 2 | 3) => {
    try {
      const filename = `lvl${level}.jpg`;
      const response = await fetch(`/samples/${filename}`);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "image/jpeg" });
      
      const dt = new DataTransfer();
      dt.items.add(file);
      handlePickFiles(dt.files);
    } catch (error) {
      console.error("Failed to load sample", error);
    }
  };

  const processBatch = async () => {
    const pendingItems = queue.filter(q => q.status === "pending")
    if (!pendingItems.length) return

    // Update status to processing
    setQueue(prev => prev.map(item => 
      pendingItems.some(p => p.id === item.id) 
        ? { ...item, status: "processing", progress: 25 } 
        : item
    ))

    // Start progress simulation
    const timer = setInterval(() => {
      setQueue(prev => prev.map(item => 
        item.status === "processing" && item.progress < 90
          ? { ...item, progress: item.progress + 5 }
          : item
      ))
    }, 500)

    try {
      const filesToProcess = pendingItems.map(p => p.file)
      // Call the batch extract endpoint using a new api method
      const formData = new FormData()
      filesToProcess.forEach((f) => formData.append("files", f))
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/documents/batch-extract`, {
        method: "POST",
        body: formData,
      })
      
      const data = await response.json()
      
      setQueue(prev => prev.map(item => {
        const result = data.results?.find((r: any) => r.filename === item.file.name)
        if (result?.status === "success") {
          return { ...item, status: "verified", progress: 100 }
        } else if (result?.status === "error") {
          return { ...item, status: "error", error: result.error, progress: 100 }
        }
        return item
      }))

    } catch (err) {
      setQueue(prev => prev.map(item => 
        pendingItems.some(p => p.id === item.id) 
          ? { ...item, status: "error", error: "Batch processing failed", progress: 100 }
          : item
      ))
    } finally {
      clearInterval(timer)
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/20 px-6 py-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => handlePickFiles(e.target.files)}
        />
        <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground">
          <UploadCloud className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium">Drop multiple documents here</p>
          <p className="text-xs text-muted-foreground">or click to browse · Batch upload supported</p>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Upload Queue ({queue.length})</h3>
            <Button size="sm" onClick={processBatch} disabled={queue.some(q => q.status === "processing")}>
              Process Pending
            </Button>
          </div>
          
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-2">
            {queue.map((item) => (
              <div key={item.id} className="flex items-center gap-4 rounded-lg border border-border p-3 glass-surface">
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium truncate max-w-[250px]">{item.file.name}</p>
                    <div className="flex items-center gap-1.5 text-xs">
                      {item.status === "pending" && <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> Pending</span>}
                      {item.status === "processing" && <span className="flex items-center gap-1 text-blue-500"><Loader2 className="h-3 w-3 animate-spin" /> Processing</span>}
                      {item.status === "verified" && <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="h-3 w-3" /> Indexed</span>}
                      {item.status === "error" && <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> Failed</span>}
                    </div>
                  </div>
                  
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div 
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${item.progress}%`, backgroundColor: item.status === "error" ? "var(--destructive)" : item.status === "verified" ? "var(--success)" : undefined }}
                    />
                  </div>
                  {item.error && <p className="text-[10px] text-destructive">{item.error}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Judge Trial Section */}
      <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4 backdrop-blur-md">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 text-center">
          Judge Trial Samples: Click to auto-test OCR accuracy across different difficulty levels.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleJudgeSample(1)} className="text-xs bg-white/5 border-white/10 hover:bg-white/10">
            Lvl 1: Digital/Clean
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleJudgeSample(2)} className="text-xs bg-white/5 border-white/10 hover:bg-white/10">
            Lvl 2: Neat Handwriting
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleJudgeSample(3)} className="text-xs bg-white/5 border-white/10 hover:bg-white/10">
            Lvl 3: Crazy Handwriting
          </Button>
        </div>
      </div>
    </div>
  )
}
