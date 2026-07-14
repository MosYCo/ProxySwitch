import { Activity, Layers, Box, Wifi } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatsBarProps {
  projectCount: number
  envCount: number
  healthyCount: number
  ports: string
}

export function StatsBar({ projectCount, envCount, healthyCount, ports }: StatsBarProps) {
  const items = [
    {
      label: "项目",
      value: projectCount,
      icon: Box,
      tone: "primary",
    },
    {
      label: "环境",
      value: envCount,
      icon: Layers,
      tone: "info",
    },
    {
      label: "健康",
      value: `${healthyCount}/${envCount}`,
      icon: Activity,
      tone: healthyCount === envCount && envCount > 0 ? "success" : "warning",
    },
  ]

  return (
    <Card>
      <CardContent className="grid gap-3 p-3 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(220px,1.4fr)]">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="flex items-center gap-3 rounded-sm bg-muted/40 px-3 py-2">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-sm border",
                  item.tone === "primary" && "border-primary/25 bg-primary/10 text-primary",
                  item.tone === "info" && "border-info/25 bg-info/10 text-info",
                  item.tone === "success" && "border-success/25 bg-success/10 text-success",
                  item.tone === "warning" && "border-warning/25 bg-warning/10 text-warning"
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-lg font-semibold leading-tight text-foreground">
                  {item.value}
                </p>
              </div>
            </div>
          )
        })}

        <div className="flex min-w-0 items-center gap-3 rounded-sm bg-muted/40 px-3 py-2">
          <div className="flex size-8 items-center justify-center rounded-sm border border-warning/25 bg-warning/10 text-warning">
            <Wifi className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">监听端口</p>
            <Badge variant="outline" className="mt-1 max-w-full truncate font-mono">
              {ports || "---"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
