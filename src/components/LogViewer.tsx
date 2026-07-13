import { useCallback, useEffect, useRef, useState } from "react"
import { Trash2, RefreshCw, Terminal, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { logApi } from "@/api"
import type { LogEntry } from "@/api"
import { cn } from "@/lib/utils"

interface LogViewerProps {
  maxEntries?: number
}

type LogView = "all" | "runtime" | "caddy"

const levelConfig: Record<string, { color: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "ghost" }> = {
  DEBUG: { color: "text-muted-foreground", variant: "ghost" },
  INFO: { color: "text-foreground", variant: "info" },
  WARN: { color: "text-amber-400", variant: "warning" },
  ERROR: { color: "text-red-400", variant: "destructive" },
}

const categoryLabels: Record<string, string> = {
  system: "系统",
  proxy: "代理",
  health: "健康",
  caddy: "服务",
}

const runtimeCategories = new Set(["system", "proxy", "health"])

export function LogViewer({ maxEntries = 100 }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [view, setView] = useState<LogView>("all")
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [loading, setLoading] = useState(false)
  const [stickToBottom, setStickToBottom] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await logApi.getRecent(maxEntries)
      setLogs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch logs:", error)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [maxEntries])

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 15000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  useEffect(() => {
    if (containerRef.current && stickToBottom) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, stickToBottom])

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    setStickToBottom(distanceFromBottom < 24)
  }

  const handleClear = async () => {
    try {
      await logApi.clear()
      setLogs([])
    } catch (error) {
      console.error("Failed to clear logs:", error)
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = levelFilter === "all" || log.level === levelFilter
    const matchesView =
      view === "all" ||
      (view === "caddy" && log.category === "caddy") ||
      (view === "runtime" && runtimeCategories.has(log.category))

    return matchesLevel && matchesView
  })

  const counts = logs.reduce(
    (acc, log) => {
      acc.all += 1
      if (log.category === "caddy") {
        acc.caddy += 1
      } else if (runtimeCategories.has(log.category)) {
        acc.runtime += 1
      }
      return acc
    },
    { all: 0, runtime: 0, caddy: 0 }
  )

  const viewOptions: Array<{ value: LogView; label: string; count: number }> = [
    { value: "all", label: "全部", count: counts.all },
    { value: "runtime", label: "系统运行", count: counts.runtime },
    { value: "caddy", label: "Caddy", count: counts.caddy },
  ]

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-display font-semibold tracking-wide">
              系统日志
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {filteredLogs.length}/{logs.length}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex rounded-sm border border-border/50 bg-muted/30 p-0.5">
              {viewOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={view === option.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[11px] font-mono"
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {option.count}
                  </span>
                </Button>
              ))}
            </div>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[90px] h-7 text-xs font-mono">
                <SelectValue placeholder="级别" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="text-xs">全部</SelectItem>
                <SelectItem value="DEBUG" className="text-xs">调试</SelectItem>
                <SelectItem value="INFO" className="text-xs">信息</SelectItem>
                <SelectItem value="WARN" className="text-xs">警告</SelectItem>
                <SelectItem value="ERROR" className="text-xs">错误</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchLogs}
              disabled={loading}
              aria-label="刷新日志"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  disabled={logs.length === 0}
                  aria-label="清空日志"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>清空日志</AlertDialogTitle>
                  <AlertDialogDescription>
                    将清空当前日志记录。此操作不可撤销。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleClear}
                  >
                    确认清空
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="h-[250px] overflow-y-auto rounded-sm border bg-muted/30 p-2 font-mono text-xs"
          onScroll={handleScroll}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Terminal className="h-6 w-6 opacity-30" />
              <p className="text-xs">{logs.length === 0 ? "暂无日志" : "当前筛选无日志"}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredLogs.map((log) => (
                <div
                  key={`${log.timestamp}-${log.level}-${log.category}-${log.message}`}
                  className={cn(
                    "flex items-center gap-2 py-1 px-1.5 rounded-sm",
                    "hover:bg-muted/50 transition-colors group"
                  )}
                >
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-muted-foreground w-16 flex-shrink-0 tabular-nums">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <Badge
                    variant={levelConfig[log.level]?.variant || "default"}
                    className="w-12 justify-center flex-shrink-0 text-[10px]"
                  >
                    {log.level}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="w-10 justify-center flex-shrink-0 text-[10px]"
                  >
                    {categoryLabels[log.category] || log.category.substring(0, 2)}
                  </Badge>
                  <span className={cn("flex-1 truncate", levelConfig[log.level]?.color)}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
