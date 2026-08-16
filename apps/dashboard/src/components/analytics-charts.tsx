import type { DashboardData } from "@language-coach/core"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const activityConfig = {
  count: { label: "Learning notes", color: "var(--chart-1)" },
} satisfies ChartConfig

const languageConfig = {
  target: { label: "Target language", color: "var(--chart-1)" },
  native: { label: "Native language", color: "var(--chart-2)" },
  mixed: { label: "Mixed", color: "var(--chart-3)" },
  other: { label: "Other", color: "var(--chart-4)" },
} satisfies ChartConfig

const categoryConfig = {
  count: { label: "Corrections", color: "var(--chart-2)" },
} satisfies ChartConfig

function weekday(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })
}

function formatChartDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function ActivityChart({ activity }: { activity: DashboardData["progress"]["weeklyActivity"] }) {
  return (
    <ChartContainer config={activityConfig} className="h-[17rem] w-full" aria-label="Learning notes saved over the last seven days">
      <AreaChart accessibilityLayer data={activity} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickFormatter={weekday} tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatChartDate(String(value))} />} />
        <Area dataKey="count" type="monotone" fill="var(--color-count)" fillOpacity={0.12} stroke="var(--color-count)" strokeWidth={2} activeDot={{ r: 5 }} />
      </AreaChart>
    </ChartContainer>
  )
}

export function LanguageUseChart({ data }: { data: DashboardData }) {
  const { languageUse } = data.progress
  const chartData = [
    { kind: "target", value: languageUse.target },
    { kind: "native", value: languageUse.native },
    { kind: "mixed", value: languageUse.mixed },
    { kind: "other", value: languageUse.other },
  ]
  const total = chartData.reduce((sum, item) => sum + item.value, 0)

  return (
    <ChartContainer config={languageConfig} className="mx-auto h-[17rem] w-full max-w-[22rem]" aria-label="Language use distribution">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="kind" />} />
        <Pie data={chartData} dataKey="value" nameKey="kind" innerRadius={66} outerRadius={96} strokeWidth={3}>
          {chartData.map((item) => <Cell key={item.kind} fill={`var(--color-${item.kind})`} />)}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-semibold tabular-nums">{languageUse.targetShare}%</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-xs">target share</tspan>
                </text>
              )
            }}
          />
        </Pie>
        {total === 0 && <text x="50%" y="52%" textAnchor="middle" className="fill-muted-foreground text-xs">No activity yet</text>}
      </PieChart>
    </ChartContainer>
  )
}

export function CategoryChart({ categories }: { categories: DashboardData["progress"]["categoryCounts"] }) {
  const chartData = categories.length ? categories.slice(0, 7) : [{ category: "No corrections", count: 0 }]
  return (
    <ChartContainer config={categoryConfig} className="h-[17rem] w-full" aria-label="Correction categories">
      <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 4, right: 18 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis dataKey="category" type="category" tickLine={false} axisLine={false} width={88} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 5, 5, 0]} barSize={18} />
      </BarChart>
    </ChartContainer>
  )
}
