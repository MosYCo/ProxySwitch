import { RefreshCw, ArrowLeftRight } from "lucide-react"
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
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {/* 标志 */}
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 bg-primary/10 border border-primary/30 rounded-sm flex items-center justify-center">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
            </div>
            <div>
              <h1 className="text-sm font-display font-bold tracking-wider text-foreground">
                代理<span className="text-primary">管理器</span>
              </h1>
              <p className="text-[9px] font-mono text-muted-foreground tracking-widest -mt-0.5">
                CADDY 控制中心
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionBadge isConnected={isConnected} />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCaddyActive ? "bg-emerald-500" : "bg-red-500"
              )}
            />
            <span className="text-[10px] font-mono text-muted-foreground">
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
                >
                  停止
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs font-mono"
                  onClick={onStart}
                >
                  启动
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs font-mono"
                onClick={onRestart}
              >
                重启
              </Button>
            </div>
          )}
          <Separator orientation="vertical" className="h-5" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
