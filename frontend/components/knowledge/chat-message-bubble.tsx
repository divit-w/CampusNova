"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { motion } from "framer-motion"
import { AlertTriangle, RotateCcw, Sparkles } from "lucide-react"
import { CitationChip } from "@/components/knowledge/citation-chip"
import { Button } from "@/components/ui/button"
import type { RAGCitation } from "@/lib/types"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: RAGCitation[]
  isError?: boolean
}

/** Prose class map for react-markdown inside assistant bubbles. */
const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-medium first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
  ),
  hr: () => <hr className="my-2 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
}

export function ChatMessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const isUser = message.role === "user"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className={cn("flex w-full gap-2.5", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <span
          className={cn(
            "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
            message.isError
              ? "bg-destructive/10 text-destructive"
              : "bg-gradient-to-br from-primary to-live text-primary-foreground",
          )}
        >
          {message.isError ? <AlertTriangle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </span>
      )}

      <div className={cn("flex max-w-[78%] flex-col gap-1.5", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm leading-relaxed shadow-soft",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : message.isError
                ? "rounded-bl-md border border-destructive/20 bg-destructive/[0.06] text-foreground"
                : "rounded-bl-md border border-border glass-surface text-foreground",
          )}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {message.isError && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap items-start gap-1.5 pl-0.5">
            {message.citations.map((citation, i) => (
              <CitationChip key={`${citation.document_id}-${citation.chunk_index}`} citation={citation} index={i} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
