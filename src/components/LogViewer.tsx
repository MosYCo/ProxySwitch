import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
} from "lucide-react"
import type { LogEntry } from "@/api"
import { logApi } from "@/api"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

interface LogViewerProps {
  maxEntries?: number
}

type LogView = "all" | "runtime" | "caddy"

const levelConfig: Record<
  string,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "ghost"
    messageClass?: string
  }
> = {
  DEBUG: { label: "调试", variant: "ghost", messageClass: "text-muted-foreground" },
  INFO: { label: "信息", variant: "info" },
  WARN: { label: "警告", variant: "warning", messageClass: "text-warning" },
  ERROR: { label: "错误", variant: "destructive", messageClass: "text-destructive" },
}

const categoryLabels: Record<string, string> = {
  system: "系统",
  proxy: "代理",
  health: "健康",
  caddy: "Caddy",
}

const runtimeCategories = new Set(["system", "proxy", "health"])

const caddyDetailFields: Array<{
  label: string
  path: string[]
  format?: (value: unknown) => string | null
}> = [
  { label: "模块", path: ["logger"] },
  { label: "地址", path: ["address"] },
  { label: "服务", path: ["server_name"] },
  { label: "状态", path: ["status"] },
  { label: "方法", path: ["request", "method"] },
  { label: "路径", path: ["request", "uri"] },
  { label: "来源", path: ["request", "remote_ip"] },
  { label: "耗时", path: ["duration"], format: formatDurationField },
  { label: "文件", path: ["file"] },
  { label: "适配器", path: ["adapter"] },
]

function getRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function readPath(value: unknown, path: string[]) {
  let current: unknown = value
  for (const segment of path) {
    const record = getRecord(current)
    if (!record || !(segment in record)) return undefined
    current = record[segment]
  }
  return current
}

function formatPrimitive(value: unknown): string | null {
  if (typeof value === "string") return value || null
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    const text = value.map(formatPrimitive).filter(Boolean).join(", ")
    return text || null
  }
  return null
}

function formatDurationField(value: unknown) {
  if (typeof value !== "number") return null
  return value < 1 ? `${(value * 1000).toFixed(1)}ms` : `${value.toFixed(2)}s`
}

function formatCaddyDetails(log: LogEntry) {
  if (log.category !== "caddy" || !log.data) return []

  return caddyDetailFields
    .map((field) => {
      const value = readPath(log.data, field.path)
      const text = field.format ? field.format(value) : formatPrimitive(value)
      return text ? `${field.label}: ${text}` : null
    })
    .filter((item): item is string => Boolean(item))
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function getLogKey(log: LogEntry, index: number) {
  return `${log.timestamp}-${log.level}-${log.category}-${index}`
}

function getViewport(root: HTMLDivElement | null) {
  return root?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null
}

export function LogViewer({ maxEntries = 100 }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [view, setView] = useState<LogView>("all")
  const [levelFilter, setLevelFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const scrollRootRef = useRef<HTMLDivElement>(null)

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
    let unlisten: UnlistenFn | undefined
    let disposed = false

    listen<LogEntry>("log.created", (event) => {
      if (disposed) return
      setLogs((current) => [...current, event.payload].slice(-maxEntries))
    }).then((fn) => {
      if (disposed) {
        fn()
      } else {
        unlisten = fn
      }
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [maxEntries])

  useEffect(() => {
    if (!autoScroll) return

    const viewport = getViewport(scrollRootRef.current)
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [logs, autoScroll])

  useEffect(() => {
    const viewport = getViewport(scrollRootRef.current)
    if (!viewport) return

    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      if (distanceFromBottom > 32) {
        setAutoScroll(false)
      }
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [])

  const handleClear = async () => {
    try {
      await logApi.clear()
      setLogs([])
      setExpanded(new Set())
    } catch (error) {
      console.error("Failed to clear logs:", error)
    }
  }

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return logs.filter((log) => {
      const details = formatCaddyDetails(log)
      const matchesLevel = levelFilter === "all" || log.level === levelFilter
      const matchesView =
        view === "all" ||
        (view === "caddy" && log.category === "caddy") ||
        (view === "runtime" && runtimeCategories.has(log.category))
      const searchable = [
        log.message,
        log.level,
        categoryLabels[log.category] || log.category,
        details.join(" "),
        log.data ? JSON.stringify(log.data) : "",
      ]
        .join(" ")
        .toLowerCase()

      return (
        matchesLevel &&
        matchesView &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      )
    })
  }, [levelFilter, logs, query, view])

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

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">系统日志</CardTitle>
            <Badge variant="outline" className="font-mono">
              {filteredLogs.length}/{logs.length}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(value) => value && setView(value as LogView)}
              variant="outline"
              size="sm"
              className="justify-start"
            >
              <ToggleGroupItem value="all">全部 {counts.all}</ToggleGroupItem>
              <ToggleGroupItem value="runtime">系统 {counts.runtime}</ToggleGroupItem>
              <ToggleGroupItem value="caddy">Caddy {counts.caddy}</ToggleGroupItem>
            </ToggleGroup>

            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="h-9 w-[104px]">
                <SelectValue placeholder="级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部级别</SelectItem>
                  <SelectItem value="DEBUG">调试</SelectItem>
                  <SelectItem value="INFO">信息</SelectItem>
                  <SelectItem value="WARN">警告</SelectItem>
                  <SelectItem value="ERROR">错误</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-md border bg-background px-2 sm:flex-none">
              <Search className="size-4 flex-shrink-0 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索日志"
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <label className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-muted-foreground">
              <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
              自动滚动
            </label>

            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={fetchLogs}
              disabled={loading}
              aria-label="刷新日志"
            >
              <RefreshCw
                className={cn(loading && "animate-spin")}
                data-icon="inline-start"
              />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  disabled={logs.length === 0}
                  aria-label="清空日志"
                >
                  <Trash2 data-icon="inline-start" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
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
        <ScrollArea
          ref={scrollRootRef}
          className="h-[300px] rounded-sm border bg-muted/30 font-mono text-xs"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
              <Terminal className="size-6 opacity-40" />
              <p>{logs.length === 0 ? "暂无日志" : "当前筛选无日志"}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 p-2">
              {filteredLogs.map((log, index) => {
                const key = getLogKey(log, index)
                const details = formatCaddyDetails(log)
                const isExpanded = expanded.has(key)
                const rawJson = log.data ? JSON.stringify(log.data, null, 2) : null
                const level = levelConfig[log.level] || levelConfig.INFO

                return (
                  <div
                    key={key}
                    className="rounded-sm px-1.5 py-1 transition-colors hover:bg-muted"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-0.5 size-5 flex-shrink-0"
                        onClick={() => rawJson && toggleExpanded(key)}
                        disabled={!rawJson}
                        aria-label={isExpanded ? "收起原始日志" : "展开原始日志"}
                      >
                        {isExpanded ? (
                          <ChevronDown data-icon="inline-start" />
                        ) : (
                          <ChevronRight data-icon="inline-start" />
                        )}
                      </Button>
                      <span className="mt-1 w-16 flex-shrink-0 text-muted-foreground tabular-nums">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <Badge
                        variant={level.variant}
                        className="mt-0.5 w-12 flex-shrink-0 justify-center"
                      >
                        {log.level}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="mt-0.5 w-12 flex-shrink-0 justify-center"
                      >
                        {categoryLabels[log.category] || log.category.substring(0, 6)}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate", level.messageClass)}>
                          {log.message}
                        </p>
                        {details.length > 0 && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {details.join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                    {rawJson && isExpanded && (
                      <pre className="ml-[7.5rem] mt-2 max-h-40 overflow-auto rounded-sm border bg-background p-2 text-[10px] text-muted-foreground">
                        {rawJson}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
