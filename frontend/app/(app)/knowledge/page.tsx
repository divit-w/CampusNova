"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { MessagesSquare, Sparkles } from "lucide-react"
import { ChatComposer } from "@/components/knowledge/chat-composer"
import { ChatMessageBubble, type ChatMessage } from "@/components/knowledge/chat-message-bubble"
import { KnowledgeUploadControl } from "@/components/knowledge/knowledge-upload-control"
import { TypingIndicator } from "@/components/knowledge/typing-indicator"
import { PageHeading } from "@/components/states"
import { api, ApiError } from "@/lib/api"
import { spring } from "@/lib/motion"

const EXAMPLE_PROMPTS = [
  "What is the school's late-arrival policy?",
  "Summarize the admissions requirements",
  "What documents are needed for a transfer student?",
  "What is the grading scale for grade 8?",
]

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function KnowledgePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  async function send(raw: string, retryOf?: string) {
    const trimmed = raw.trim()
    if (!trimmed || loading) return

    if (!retryOf) {
      setMessages((prev) => [...prev, { id: makeId(), role: "user", content: trimmed }])
      setInput("")
    }
    setLoading(true)

    try {
      const res = await api.queryKnowledge(trimmed)
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: res.answer, citations: res.citations }])
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : "Something went wrong reaching the knowledge base."
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: message, isError: true }])
    } finally {
      setLoading(false)
    }
  }

  function useExample(prompt: string) {
    void send(prompt)
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      <PageHeading
        icon={<MessagesSquare className="h-5 w-5" />}
        title={<span className="text-gradient-brand">Knowledge Base</span>}
        description="Ask questions in plain English — answers are grounded in your indexed school documents with source citations."
        actions={<KnowledgeUploadControl />}
      />

      <div className="flex h-[calc(100vh-15rem)] min-h-[420px] flex-col overflow-hidden rounded-xl glass-surface shadow-soft">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
          {messages.length === 0 && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.gentle}
              className="flex h-full flex-col items-center justify-center gap-5 py-6 text-center"
            >
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-primary to-live text-primary-foreground shadow-soft">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-medium">Ask anything about your indexed documents</p>
                <p className="mt-1 text-pretty text-sm text-muted-foreground">
                  Every answer cites the exact chunks it was pulled from.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => useExample(prompt)}
                    className="glass-surface rounded-xl px-3.5 py-2.5 text-left text-xs font-medium text-foreground transition-all duration-300 ease-spring hover:-translate-y-[1px] hover:scale-[1.01] hover:border-primary/40 hover:bg-white/80 hover:shadow-soft"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                onRetry={message.isError ? () => send(messages[messages.length - 2]?.content ?? "", message.id) : undefined}
              />
            ))}
            {loading && <TypingIndicator key="typing" />}
          </AnimatePresence>
        </div>

        <ChatComposer value={input} onChange={setInput} onSend={() => send(input)} loading={loading} />
      </div>
    </div>
  )
}
