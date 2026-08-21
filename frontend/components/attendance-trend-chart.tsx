"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/states"
import { useDashboardSummary } from "@/lib/use-dashboard-summary"

const chartConfig: ChartConfig = {
  present: { label: "Present", color: "hsl(var(--chart-1))" },
  absent: { label: "Absent", color: "hsl(var(--chart-5))" },
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short" })
}

/** Weekly attendance focal point — GET /admin/dashboard-summary :: weekly_attendance (7 real days). */
export function AttendanceTrendChart() {
  const { data, isLoading } = useDashboardSummary(true)

  const hasAnyRecords = data?.weekly_attendance.some((d) => d.total > 0)

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border p-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <TrendingUp className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">Weekly attendance</p>
          <p className="text-xs text-muted-foreground">Present vs. absent, last 7 days</p>
        </div>
      </div>

      <div className="p-5">
        {isLoading && !data ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : !hasAnyRecords ? (
          <EmptyState
            icon={TrendingUp}
            title="No attendance recorded yet"
            description="Once attendance sheets are processed, the weekly trend appears here."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <AreaChart data={data?.weekly_attendance} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="fillPresent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-present)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-present)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillAbsent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-absent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-absent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={4} width={28} fontSize={12} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const iso = payload?.[0]?.payload?.date
                      return typeof iso === "string" ? dayLabel(iso) : ""
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="present"
                stroke="var(--color-present)"
                fill="url(#fillPresent)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="absent"
                stroke="var(--color-absent)"
                fill="url(#fillAbsent)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </Card>
  )
}
