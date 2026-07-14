import { ArrowLeftRight, Loader2, Play, RefreshCw, Settings, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ConnectionBadge } from "@/components/StatusBadge"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"

interface HeaderProps {
  isConnected: boolean
  isCaddyActive: boolean
  canManageCaddy: boolean
  caddyManaged?: boolean
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onRefresh: () => void
  onSettings: () => void
  refreshing?: boolean
  caddyAction?: "start" | "stop" | "restart" | null
}

export function Header({
  isConnected,
  isCaddyActive,
  canManageCaddy,
  caddyManaged,
  onStart,
  onStop,
  onRestart,
  onRefresh,
  onSettings,
  refreshing = false,
  caddyAction = null,
}: HeaderProps) {
  const caddyBusy = caddyAction !== null

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/88 backdrop-blur-xl">
      <div className="container flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative flex size-8 flex-shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/10">
            <ArrowLeftRight className="size-4 text-primary" />
            <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-display font-semibold text-foreground">
              代理管理器
            </h1>
            <p className="hidden truncate text-[10px] text-muted-foreground sm:block">
              Caddy 线路切换台
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <ConnectionBadge isConnected={isConnected} />
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <Badge variant={isCaddyActive ? "success" : "destructive"} className="hidden sm:inline-flex">
            Caddy {isCaddyActive ? "运行中" : "已停止"}
          </Badge>
          {canManageCaddy && (
            <div className="flex items-center gap-1">
              {caddyManaged ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={onStop}
                  disabled={caddyBusy}
                >
                  {caddyAction === "stop" ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Square data-icon="inline-start" />
                  )}
                  停止
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={onStart}
                  disabled={caddyBusy}
                >
                  {caddyAction === "start" ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  启动
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={onRestart}
                disabled={caddyBusy}
              >
                {caddyAction === "restart" && (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                )}
                重启
              </Button>
            </div>
          )}
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onSettings}
            disabled={caddyBusy || refreshing}
            aria-label="Caddy 设置"
          >
            <Settings data-icon="inline-start" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="刷新"
          >
            <RefreshCw
              className={cn(refreshing && "animate-spin")}
              data-icon="inline-start"
            />
          </Button>
        </div>
      </div>
    </header>
  )
}
