"use client"

import { motion } from "framer-motion"
import { Table2, Braces, Hash, List } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { spring, listContainer, listItem } from "@/lib/motion"

/**
 * Adaptive renderer for NLP / ERP results.
 *
 * SECURITY (audit P0-3): every value is rendered as React text content (JSX children).
 * We NEVER use dangerouslySetInnerHTML, so any HTML/script in LLM or DB output is inert.
 */

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A list of objects → responsive data table. */
function TableView({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((k) => set.add(k))
      return set
    }, new Set()),
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              {columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {humanizeKey(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <motion.tr
                key={i}
                variants={listItem}
                className="border-t border-border/70 transition-colors hover:bg-muted/40"
              >
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-4 py-2.5 text-foreground">
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** A single object → key/value panel. */
function KeyValueView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <motion.div key={key} variants={listItem} className="glass-surface px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {humanizeKey(key)}
          </dt>
          <dd className="mt-1 break-words text-sm font-medium text-foreground">
            {formatCellValue(value)}
          </dd>
        </motion.div>
      ))}
    </div>
  )
}

/** A list of scalars → chip list. */
function ScalarListView({ items }: { items: unknown[] }) {
  return (
    <motion.ul variants={listContainer} className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <motion.li key={i} variants={listItem}>
          <span className="inline-flex rounded-lg border border-border glass-surface px-3 py-1.5 text-sm text-foreground">
            {formatCellValue(item)}
          </span>
        </motion.li>
      ))}
    </motion.ul>
  )
}

export function ResultRenderer({ results }: { results: unknown }) {
  // Determine the shape and pick the best rendering.
  let mode: "table" | "keyvalue" | "scalars" | "scalar"
  let content: React.ReactNode
  let icon: React.ReactNode
  let shapeLabel: string

  if (Array.isArray(results)) {
    const objectRows = results.filter(isPlainObject)
    if (results.length > 0 && objectRows.length === results.length) {
      mode = "table"
      icon = <Table2 className="h-3.5 w-3.5" />
      shapeLabel = `${results.length} record${results.length === 1 ? "" : "s"}`
      content = <TableView rows={objectRows} />
    } else {
      mode = "scalars"
      icon = <List className="h-3.5 w-3.5" />
      shapeLabel = `${results.length} item${results.length === 1 ? "" : "s"}`
      content = <ScalarListView items={results} />
    }
  } else if (isPlainObject(results)) {
    mode = "keyvalue"
    icon = <Braces className="h-3.5 w-3.5" />
    shapeLabel = "1 record"
    content = <KeyValueView data={results} />
  } else {
    mode = "scalar"
    icon = <Hash className="h-3.5 w-3.5" />
    shapeLabel = "value"
    content = (
      <div className="rounded-xl border border-border glass-surface px-4 py-3 text-sm text-foreground">
        {formatCellValue(results)}
      </div>
    )
  }

  return (
    <motion.div
      variants={listContainer}
      initial="hidden"
      animate="show"
      transition={spring.gentle}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <Badge variant="neutral" className="gap-1.5">
          {icon}
          {mode === "table" ? "Table" : mode === "keyvalue" ? "Record" : mode === "scalars" ? "List" : "Value"}
        </Badge>
        <span className="text-xs text-muted-foreground">{shapeLabel}</span>
      </div>
      {content}
    </motion.div>
  )
}
