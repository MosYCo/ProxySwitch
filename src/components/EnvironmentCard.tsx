import { Check, X, ArrowLeftRight, Zap, Radio, Pencil, Trash2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { Environment, HealthStatus } from "@/api"

interface EnvironmentCardProps {
  name: string
  environment: Environment
  isActive: boolean
  healthStatus?: HealthStatus
  onSwitch: () => void
  onEdit?: () => void
  onDelete?: () => void
  switching?: boolean
  disabled?: boolean
}

export function EnvironmentCard({
  name,
  environment,
  isActive,
  healthStatus,
  onSwitch,
  onEdit,
  onDelete,
  switching = false,
  disabled = false,
}: EnvironmentCardProps) {
  const isHealthy = healthStatus?.healthy ?? true
  const latency = healthStatus?.latency_ms

  // 解析协议
  const getProtocol = (addr: string) => {
    if (addr.startsWith("https://")) return "HTTPS"
    if (addr.startsWith("http://")) return "HTTP"
    return "HTTP"
  }

  // 格式化地址显示
  const formatAddr = (addr: string) => {
    return addr.replace(/^https?:\/\//, "")
  }

  const protocol = getProtocol(environment.addr)
  const isHttps = protocol === "HTTPS"

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200",
        isActive
          ? "border-primary/50 glow-green"
          : "hover:border-border/80 hover:bg-card/80"
      )}
    >
      {/* Top accent line for active */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-primary/80 to-transparent" />
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Status indicator */}
            <div className="flex flex-shrink-0 items-center gap-2">
              {isActive ? (
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary animate-ping opacity-40" />
                </div>
              ) : (
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    isHealthy ? "bg-muted-foreground/30" : "bg-destructive/50"
                  )}
                />
              )}
            </div>

            <div className="min-w-0">
              <CardTitle className="truncate text-sm font-display font-semibold tracking-wide uppercase">
                {name}
              </CardTitle>
              <CardDescription className="mt-0.5 truncate text-xs">
                {environment.desc || "未填写描述"}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
            {healthStatus && (
              <Badge variant={isHealthy ? "success" : "destructive"} className="text-[10px]">
                {isHealthy ? (
                  <Check className="mr-1 h-2.5 w-2.5" />
                ) : (
                  <X className="mr-1 h-2.5 w-2.5" />
                )}
                {isHealthy ? "健康" : "异常"}
              </Badge>
            )}
            {isActive && (
              <Badge variant="info" className="text-[10px]">
                <Radio className="mr-1 h-2.5 w-2.5" />
                当前
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Badge
              variant={isHttps ? "warning" : "ghost"}
              className="flex-shrink-0 text-[10px] font-mono px-1 py-0"
            >
              {protocol}
            </Badge>
            <code className="min-w-0 max-w-full truncate rounded-sm border border-primary/10 bg-primary/5 px-2 py-1 text-xs font-mono text-primary/80 sm:max-w-[220px]">
              {formatAddr(environment.addr)}
            </code>
            {latency !== undefined && isHealthy && (
              <span className="flex flex-shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                <Zap className="h-2.5 w-2.5 text-amber-500" />
                {latency}ms
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:flex-shrink-0 sm:justify-end">
            {!isActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSwitch}
                className="h-7 px-2.5 text-xs"
                disabled={disabled}
              >
                {switching ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <ArrowLeftRight className="mr-1 h-3 w-3" />
                )}
                {switching ? "切换中" : "切换"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              disabled={disabled}
              aria-label={`编辑环境 ${name}`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={disabled}
                    aria-label={`删除环境 ${name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除环境</AlertDialogTitle>
                    <AlertDialogDescription>
                      将删除环境「{name}」。此操作不可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={onDelete}
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
