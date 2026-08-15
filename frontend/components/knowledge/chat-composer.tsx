"use client"

import { useRef } from "react"
import { ArrowUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ChatComposer({
  value,
  onChange,
  onSend,
  loading,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  loading: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Respect IME composition (CJK) and Safari's unreliable final event.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  return (
    <div className="glass sticky bottom-0 z-10 border-t border-border px-4 py-3 sm:px-6">
      <div className="flex items-end gap-2 rounded-xl border border-border glass-surface p-1.5 shadow-soft transition-colors focus-within:border-primary/50">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            autoGrow(e.target)
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask the knowledge base…"
          aria-label="Ask the knowledge base"
          className="max-h-[120px] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <Button
          onClick={onSend}
          disabled={!value.trim() || loading}
          size="icon"
          aria-label="Send message"
          aria-busy={loading}
          className={cn("mb-0.5 mr-0.5 h-9 w-9 shrink-0 rounded-full")}
        >
          {loading ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground/70">
        Answers are generated from indexed documents and may be incomplete.
      </p>
    </div>
  )
}
