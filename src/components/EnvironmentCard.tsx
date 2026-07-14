import { useState } from "react"
import {
  AlertCircle,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Radio,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import type { Environment, HealthStatus } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

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

function getProtocol(addr: string) {
  if (addr.startsWith("https://")) return "HTTPS"
  if (addr.startsWith("http://")) return "HTTP"
  return "HTTP"
}

function formatAddr(addr: string) {
  return addr.replace(/^https?:\/\//, "")
}

function formatLastCheck(value?: string) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isHealthy = healthStatus?.healthy
  const latency = healthStatus?.latency_ms
  const protocol = getProtocol(environment.addr)
  const lastCheck = formatLastCheck(healthStatus?.last_check)

  const statusVariant =
    isHealthy === undefined ? "ghost" : isHealthy ? "success" : "destructive"
  const stripClass = isActive
    ? "bg-primary"
    : isHealthy === false
      ? "bg-destructive"
      : isHealthy
        ? "bg-success"
        : "bg-muted-foreground/30"

  return (
    <>
      <Card
        className={cn(
          "group relative overflow-hidden",
          isActive ? "border-primary/50" : "hover:border-primary/30"
        )}
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", stripClass)} />

        <CardHeader className="pb-3 pl-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <CardTitle className="truncate text-sm font-semibold">
                  {name}
                </CardTitle>
                {isActive && (
                  <Badge variant="info">
                    <Radio />
                    当前
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1 truncate text-xs">
                {environment.desc || "未填写描述"}
              </CardDescription>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1">
              <Badge variant={statusVariant}>
                {isHealthy === false ? <X /> : <Check />}
                {isHealthy === undefined ? "未检查" : isHealthy ? "健康" : "异常"}
              </Badge>
              {(onEdit || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={disabled}
                      aria-label={`打开环境 ${name} 的更多操作`}
                    >
                      <MoreHorizontal data-icon="inline-start" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuGroup>
                      {onEdit && (
                        <DropdownMenuItem onClick={onEdit}>
                          <Pencil />
                          编辑
                        </DropdownMenuItem>
                      )}
                      {onDelete && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteOpen(true)}
                        >
                          <Trash2 />
                          删除
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 pl-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge
              variant={protocol === "HTTPS" ? "warning" : "outline"}
              className="font-mono"
            >
              {protocol}
            </Badge>
            <code className="min-w-0 max-w-full truncate rounded-sm border bg-muted px-2 py-1 text-xs text-foreground sm:max-w-[240px]">
              {formatAddr(environment.addr)}
            </code>
            {latency !== undefined && isHealthy && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="size-3 text-warning" />
                {latency}ms
              </span>
            )}
            {lastCheck && (
              <span className="text-xs text-muted-foreground">
                最近检查 {lastCheck}
              </span>
            )}
          </div>

          {isHealthy === false && healthStatus?.error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="size-4" />
              <AlertDescription className="text-xs">
                {healthStatus.error}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-3 rounded-sm bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">启用此环境</p>
              <p className="truncate text-xs text-muted-foreground">
                {isActive ? "请求正在转发到该地址" : "切换后会重载 Caddy 配置"}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {switching && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              <Switch
                checked={isActive}
                disabled={disabled || switching || isActive}
                onCheckedChange={(checked) => {
                  if (checked && !isActive) onSwitch()
                }}
                aria-label={`切换到环境 ${name}`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {onDelete && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
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
    </>
  )
}
