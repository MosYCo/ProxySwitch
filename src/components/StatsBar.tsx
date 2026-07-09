import { Activity, Layers, Box, Wifi } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface StatsBarProps {
  projectCount: number
  envCount: number
  healthyCount: number
  ports: string
}

export function StatsBar({ projectCount, envCount, healthyCount, ports }: StatsBarProps) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      <Card className="border-border/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-muted-foreground tracking-widest">
                项目数
              </p>
              <p className="text-2xl font-display font-bold text-foreground mt-1">
                {projectCount}
              </p>
            </div>
            <div className="w-8 h-8 bg-primary/10 rounded-sm flex items-center justify-center">
              <Box className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-muted-foreground tracking-widest">
                环境数
              </p>
              <p className="text-2xl font-display font-bold text-foreground mt-1">
                {envCount}
              </p>
            </div>
            <div className="w-8 h-8 bg-cyan-500/10 rounded-sm flex items-center justify-center">
              <Layers className="h-4 w-4 text-cyan-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-muted-foreground tracking-widest">
                健康数
              </p>
              <p className="text-2xl font-display font-bold mt-1">
                <span className="text-emerald-500">{healthyCount}</span>
                <span className="text-muted-foreground text-sm">/{envCount}</span>
              </p>
            </div>
            <div className="w-8 h-8 bg-emerald-500/10 rounded-sm flex items-center justify-center">
              <Activity className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-muted-foreground tracking-widest">
                端口
              </p>
              <p className="text-sm font-mono font-bold text-foreground mt-2 truncate">
                {ports || "---"}
              </p>
            </div>
            <div className="w-8 h-8 bg-amber-500/10 rounded-sm flex items-center justify-center">
              <Wifi className="h-4 w-4 text-amber-500" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
