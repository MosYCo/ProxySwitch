import { ChevronRight, Home, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"

interface WorkspaceHeaderProps {
  title: string
  isConnected: boolean
  syncError?: string | null
  onRefresh: () => void
  refreshing: boolean
}

export function WorkspaceHeader({ title, isConnected, syncError, onRefresh, refreshing }: WorkspaceHeaderProps) {
  const { isMobile, open, openMobile } = useSidebar()
  const expanded = isMobile ? openMobile : open
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card/95 px-5 backdrop-blur-md lg:px-8 xl:px-10">
      <div className="flex min-w-0 items-center gap-3 text-xs">
        <SidebarTrigger aria-label="切换导航" aria-expanded={expanded} aria-controls="workspace-navigation" title={`${expanded ? "收起" : "展开"}导航（Ctrl+B）`} />
        <Separator orientation="vertical" className="h-4" />
        <Home className="hidden size-3.5 text-muted-foreground sm:block" />
        <span className="hidden text-muted-foreground sm:block">工作空间</span>
        <ChevronRight className="hidden size-3 text-muted-foreground/60 sm:block" />
        <span className="truncate font-medium">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="mr-3 hidden items-center gap-2 text-xs text-muted-foreground sm:flex" role="status" title={isConnected ? "项目、健康检查和日志会自动更新" : syncError ? `事件订阅失败：${syncError}。正在自动重试，可手动刷新状态。` : "正在订阅本地应用事件"}>
          <span className={cn("size-1.5 rounded-full", isConnected ? "bg-success" : "bg-warning")} />{isConnected ? "实时更新中" : syncError ? "同步重试中" : "同步连接中…"}
        </span>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={onRefresh} disabled={refreshing} aria-label="刷新工作台" title="刷新工作台"><RefreshCw className={cn("size-4", refreshing && "animate-spin")} /></Button>
        <div className="mx-1 h-4 border-l" />
        <ThemeToggle />
      </div>
    </header>
  )
}
