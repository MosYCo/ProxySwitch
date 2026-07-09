import { useState, useEffect, useRef } from "react"
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
import { logApi } from "@/api"
import type { LogEntry } from "@/api"
import { cn } from "@/lib/utils"

interface LogViewerProps {
  maxEntries?: number
}

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

export function LogViewer({ maxEntries = 100 }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchLogs = async () => {
    try {
      setLoading(true)
      let data: LogEntry[]
      if (levelFilter !== "all") {
        data = await logApi.getByLevel(levelFilter)
      } else if (categoryFilter !== "all") {
        data = await logApi.getByCategory(categoryFilter)
      } else {
        data = await logApi.getRecent(maxEntries)
      }
      setLogs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch logs:", error)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 15000)
    return () => clearInterval(interval)
  }, [levelFilter, categoryFilter])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

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

  const categories = Array.from(new Set(logs.filter(log => log?.category).map((log) => log.category)))

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-display font-semibold tracking-wide">
              系统日志
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {logs.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
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
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[90px] h-7 text-xs font-mono">
                <SelectValue placeholder="分类" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="text-xs">全部</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-xs">
                    {categoryLabels[cat] || cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchLogs}
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={handleClear}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="h-[250px] overflow-y-auto rounded-sm border bg-muted/30 p-2 font-mono text-xs"
        >
          {logs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Terminal className="h-6 w-6 opacity-30" />
              <p className="text-xs">暂无日志</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log) => (
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
