import { Activity, ArrowUpRight, Box, Layers, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

interface StatsBarProps {
  projectCount: number
  enabledProjectCount: number
  envCount: number
  checkedEnvCount: number
  testedEnvCount: number
  healthyCount: number
  ports: string[]
  isCaddyActive: boolean
  statusKnown: boolean
}

export function StatsBar({ projectCount, enabledProjectCount, envCount, checkedEnvCount, testedEnvCount, healthyCount, ports, isCaddyActive, statusKnown }: StatsBarProps) {
  const uniquePorts = [...new Set(ports)]
  const pendingChecks = checkedEnvCount - testedEnvCount
  const items = [
    { label: "代理项目", value: projectCount, hint: `已启用 ${enabledProjectCount} 个 · 已停用 ${projectCount - enabledProjectCount} 个`, icon: Box, tone: "bg-primary/10 text-primary" },
    { label: "环境配置", value: envCount, hint: "在不同后端之间自由切换", icon: Layers, tone: "bg-info/10 text-info" },
    { label: "可用后端", value: healthyCount, suffix: `/ ${checkedEnvCount}`, hint: checkedEnvCount === 0 ? "当前没有启用检查的后端" : pendingChecks > 0 ? `${pendingChecks} 个后端等待检查` : healthyCount === checkedEnvCount ? "最近检查均可连接" : `${checkedEnvCount - healthyCount} 个后端连接异常`, icon: Activity, tone: "bg-success/10 text-success" },
    { label: "监听端口", value: isCaddyActive && statusKnown ? uniquePorts.length : 0, hint: !statusKnown ? "正在确认引擎状态" : !isCaddyActive ? `引擎已停止 · 已配置 ${uniquePorts.length} 个端口` : uniquePorts.length ? uniquePorts.join(" · ") : "启用项目并选择环境后开始监听", icon: Radio, tone: "bg-warning/10 text-warning", mono: isCaddyActive && ports.length > 0 },
  ]

  return (
    <section aria-label="代理概览" className="grid grid-cols-2 gap-3 xl:gap-4 lg:grid-cols-4">
      {items.map(({ label, value, suffix, hint, icon: Icon, tone, mono }) => (
        <Card key={label} className="min-w-0 gap-0 px-4 py-3.5 xl:px-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={cn("flex size-7 items-center justify-center rounded-lg", tone)}><Icon className="size-3.5" strokeWidth={1.7} /></span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{value}</span>
            {suffix && <span className="text-sm text-muted-foreground/70">{suffix}</span>}
          </div>
          <p className={cn("mt-2 truncate text-xs text-muted-foreground", mono && "font-mono")} title={hint}>
            {label === "可用后端" && healthyCount > 0 && <ArrowUpRight className="mr-1 inline size-3 text-success" />}{hint}
          </p>
        </Card>
      ))}
    </section>
  )
}
