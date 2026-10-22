import { Check, X, Loader2, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Status = "healthy" | "unhealthy" | "loading" | "unknown"

interface StatusBadgeProps {
  status: Status
  showIcon?: boolean
  size?: "sm" | "default"
}

export function StatusBadge({ status, showIcon = true, size = "default" }: StatusBadgeProps) {
  const config = {
    healthy: {
      variant: "outline" as const,
      label: "健康",
      icon: Check,
    },
    unhealthy: {
      variant: "destructive" as const,
      label: "异常",
      icon: X,
    },
    loading: {
      variant: "secondary" as const,
      label: "检查中",
      icon: Loader2,
    },
    unknown: {
      variant: "ghost" as const,
      label: "未知",
      icon: AlertCircle,
    },
  }

  const { variant, label, icon: Icon } = config[status]

  return (
    <Badge variant={variant} className={cn(status === "healthy" && "border-success/25 bg-success/10 text-success", size === "sm" && "text-[10px] px-1.5 py-0")}>
      {showIcon && (
        <Icon className={cn(status === "loading" && "animate-spin")} />
      )}
      {label}
    </Badge>
  )
}

interface ConnectionBadgeProps {
  isConnected: boolean
}

export function ConnectionBadge({ isConnected }: ConnectionBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div
          className={cn(
            "size-2 rounded-full transition-colors",
            isConnected ? "bg-success" : "bg-destructive"
          )}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {isConnected ? "已连接" : "未连接"}
      </span>
    </div>
  )
}
