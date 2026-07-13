import { RefreshCw, ArrowLeftRight, Settings, Loader2, Play, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ConnectionBadge } from "@/components/StatusBadge"
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
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* 标志 */}
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/10">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-display font-bold tracking-wider text-foreground">
                代理<span className="text-primary">管理器</span>
              </h1>
              <p className="hidden text-[9px] font-mono text-muted-foreground tracking-widest -mt-0.5 sm:block">
                CADDY 控制中心
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <ConnectionBadge isConnected={isConnected} />
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCaddyActive ? "bg-emerald-500" : "bg-red-500"
              )}
            />
            <span className="hidden text-[10px] font-mono text-muted-foreground sm:inline">
              CADDY {isCaddyActive ? "运行中" : "已停止"}
            </span>
          </div>
          {canManageCaddy && (
            <div className="flex items-center gap-1">
              {caddyManaged ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs font-mono"
                  onClick={onStop}
                  disabled={caddyBusy}
                >
                  {caddyAction === "stop" ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Square className="mr-1 h-3 w-3" />
                  )}
                  停止
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs font-mono"
                  onClick={onStart}
                  disabled={caddyBusy}
                >
                  {caddyAction === "start" ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="mr-1 h-3 w-3" />
                  )}
                  启动
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs font-mono"
                onClick={onRestart}
                disabled={caddyBusy}
              >
                {caddyAction === "restart" && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                重启
              </Button>
            </div>
          )}
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onSettings}
            disabled={caddyBusy || refreshing}
            aria-label="Caddy 设置"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="刷新"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>
    </header>
  )
}
