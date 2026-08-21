"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  FileText,
  Library,
  Loader2,
  RefreshCcw,
  Trash2,
  Upload,
} from "lucide-react"

import { api, type KnowledgeDocumentSummary } from "@/lib/api"
import { PageHeading, ErrorState, EmptyState } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { spring } from "@/lib/motion"

function formatDate(iso: string) {
  if (!iso) return "—"
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function ConfirmDeleteModal({
  doc,
  onConfirm,
  onCancel,
  loading,
}: {
  doc: KnowledgeDocumentSummary
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Delete document?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This will remove <strong>{doc.title}</strong> and all {doc.total_chunks} vector chunks from ChromaDB. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            className="gap-1.5"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AdminDocumentsPage() {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const {
    data: docs,
    error,
    isLoading,
    mutate,
  } = useSWR<KnowledgeDocumentSummary[]>(
    "/knowledge/documents",
    () => api.listKnowledgeDocuments(0, 200),
    { revalidateOnFocus: false },
  )

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await api.deleteKnowledgeDocument(deleting)
      setDeleting(null)
      mutate()
    } catch (err: any) {
      setDeleteError(err?.detail ?? "Failed to delete document. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        icon={<Library className="h-5 w-5" />}
        title={<span className="text-gradient-brand">Knowledge Document Library</span>}
        description="All school documents uploaded to the RAG knowledge base. Each document is chunked and vector-indexed in ChromaDB for semantic search. Delete removes both the metadata record and all associated vectors."
        actions={
          <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-1.5">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {deleteError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{deleteError}</p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-20"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </motion.div>
        ) : error ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ErrorState error={error} onRetry={() => mutate()} />
          </motion.div>
        ) : !docs?.length ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState
              icon={Upload}
              title="No documents uploaded yet"
              description="Upload PDF documents via the Knowledge page to populate this library."
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.gentle}
          >
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted-foreground">
                      <th className="px-4 py-3">Title / Document ID</th>
                      <th className="px-4 py-3">Chunks</th>
                      <th className="px-4 py-3">SHA-256 Hash</th>
                      <th className="px-4 py-3">Uploaded</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-border/50 transition-colors hover:bg-accent/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              <FileText className="h-4 w-4" />
                            </span>
                            <div>
                              <p className="font-medium leading-tight">{doc.title}</p>
                              <p className="font-mono text-xs text-muted-foreground">{doc.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            {doc.total_chunks} chunks
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                            {doc.file_hash ? doc.file_hash.slice(0, 16) + "…" : "—"}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(doc.upload_date)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteError(null)
                              setDeleting(doc.id)
                            }}
                            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={"Delete " + doc.title}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border/50 px-4 py-3 text-xs text-muted-foreground">
                {docs.length} document{docs.length !== 1 ? "s" : ""} · {docs.reduce((acc, d) => acc + d.total_chunks, 0)} total vector chunks
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {deleting && docs && (
        <ConfirmDeleteModal
          doc={docs.find((d) => d.id === deleting)!}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  )
}
