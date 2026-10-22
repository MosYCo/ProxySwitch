import { inputBehavior } from "@/lib/inputBehavior"
import { Label } from "@/components/ui/label"
import { useEffect, useMemo, useRef, useState } from "react"
import { Activity, ArrowDown, Box, Check, Layers, Loader2, Radio, RefreshCw, Search, Terminal, Trash2 } from "lucide-react"
import type { AppSettings, CaddyStatus, HealthStatus, LogEntry, LogSource, Project } from "@/api"
import { healthCheckEnabled } from "@/lib/settings"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toggle } from "@/components/ui/toggle"
import { DetailsSection } from "@/components/DetailsSection"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { CopyButton } from "@/components/CopyButton"
import { RequestLog } from "@/components/RequestLog"
import { useToastContext } from "@/contexts/ToastContext"
import { useLogEntries } from "@/hooks/useLogEntries"
import { filterLogs, formatLogText, groupLogs, isProblemLog, isRoutineLog, logData, logSource, proxyRequest } from "@/lib/logPresentation"
import { hasProxyRoute } from "@/lib/projectRouting"
import { cn } from "@/lib/utils"

interface LogViewerProps {
  settings: AppSettings
  caddyStatus: CaddyStatus | null
  projects: Project[]
  healthStatuses: Record<string, Record<string, HealthStatus>>
  isConnected: boolean
  syncError?: string | null
  initialProject: string | null
  onSelectProject: (name: string) => void
}

const categoryLabels: Record<string, string> = { system: "软件", proxy: "代理配置", health: "后端检查", caddy: "Caddy" }
const levelTone: Record<string, string> = { DEBUG: "text-muted-foreground", INFO: "text-info", WARN: "text-warning", ERROR: "text-destructive" }
function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false })
}
function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分钟`
}

function RuntimeOverview({ caddyStatus, projects, healthStatuses, isConnected, syncError, settings }: LogViewerProps) {
  const enabled = projects.filter((project) => project.enabled)
  const routes = projects.filter(hasProxyRoute)
  const statuses = enabled.flatMap((project) => Object.entries(project.environments).filter(([name, env]) => healthCheckEnabled(settings, project, name, env)).map(([name]) => healthStatuses[project.name]?.[name]))
  const healthy = statuses.filter((status) => status?.healthy).length
  const failed = statuses.filter((status) => status?.healthy === false).length
  const checked = statuses.filter(Boolean).length
  const serving = !!caddyStatus?.reachable
  const items = [
    { label: "Caddy 引擎", value: !caddyStatus ? "正在获取" : serving ? "运行中" : caddyStatus.running ? "管理接口异常" : "已停止", hint: !caddyStatus ? "等待引擎响应" : caddyStatus.managed ? `PID ${caddyStatus.pid} · 已运行 ${formatUptime(caddyStatus.uptime_secs)}` : serving ? "连接外部服务 · 未托管进程" : "启动引擎后恢复代理服务", icon: Box, tone: serving ? "text-success" : "text-warning" },
    { label: "已启用项目", value: `${enabled.length} / ${projects.length}`, hint: `已配置代理 ${routes.length} 个 · 已停用 ${projects.length - enabled.length} 个`, icon: Layers, tone: "text-primary" },
    { label: "后端连接", value: settings.health.enabled ? `${healthy} 个可用` : "检查已关闭", hint: !statuses.length ? "当前没有启用检查的后端" : `${failed} 个异常 · ${statuses.length - checked} 个待检查`, icon: Activity, tone: failed ? "text-warning" : "text-success" },
    { label: "状态同步", value: isConnected ? "实时更新" : syncError ? "同步重试中" : "正在连接", hint: isConnected ? "状态概览与事件记录自动更新" : syncError ? "事件订阅失败，正在自动重试" : "正在订阅本地应用事件", icon: Radio, tone: isConnected ? "text-success" : "text-warning" },
  ]
  return <section aria-label="软件运行状态" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {items.map(({ label, value, hint, icon: Icon, tone }) => <Card key={label} className="min-w-0 gap-0 px-4 py-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" />{label}</p><p className={cn("mt-3 text-lg font-semibold", tone)}>{value}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{hint}</p></Card>)}
  </section>
}

interface LogStreamProps {
  limit: number
  source: LogSource
  entries: LogEntry[]
  externalCaddy: boolean
  clearing: boolean
  onClear: () => Promise<boolean>
}

function LogStream({ source, entries, externalCaddy, clearing, onClear, limit }: LogStreamProps) {
  const [query, setQuery] = useState("")
  const [level, setLevel] = useState("all")
  const [showRoutine, setShowRoutine] = useState(false)
  const [mergeRepeated, setMergeRepeated] = useState(true)
  const [follow, setFollow] = useState(true)
  const [clearOpen, setClearOpen] = useState(false)
  const scrollRoot = useRef<HTMLDivElement>(null)
  const caddy = source === "caddy"
  const title = caddy ? "Caddy 运行日志" : "软件事件"
  const sourceEntries = useMemo(() => entries.filter((entry) => logSource(entry) === source), [entries, source])
  const filtered = useMemo(() => filterLogs(sourceEntries, source, query, level, showRoutine), [sourceEntries, source, query, level, showRoutine])
  const groups = useMemo(() => groupLogs(filtered, mergeRepeated), [filtered, mergeRepeated])
  const routineCount = sourceEntries.filter(isRoutineLog).length
  const problemCount = sourceEntries.filter(isProblemLog).length
  const filteredOut = query || level !== "all"

  useEffect(() => {
    if (!follow) return
    const viewport = scrollRoot.current?.querySelector('[data-slot="scroll-area-viewport"]')
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [groups, follow])

  return <Card className="min-w-0 gap-0 overflow-hidden py-0" role="region" aria-label={title}>
    <div className="flex items-start justify-between gap-3 px-4 py-4">
      <div className="min-w-0"><h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">{caddy ? <Terminal className="size-4 text-primary" /> : <Activity className="size-4 text-primary" />}{title}<span className="text-xs font-normal tabular-nums text-muted-foreground">{filtered.length} 条</span>{problemCount > 0 && <Toggle variant="outline" size="sm" pressed={level === "problems"} onPressedChange={pressed => setLevel(pressed ? "problems" : "all")} className="text-warning">{problemCount} 条异常</Toggle>}</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{caddy ? "引擎启停、配置加载、上游错误与原始输出" : "软件启停、项目变更、后端异常与恢复"}</p></div>
      <div className="flex shrink-0 items-center gap-1">
        {filtered.length > 0 && <CopyButton value={filtered.map(formatLogText).join("\n\n")} label={`复制当前显示的${title}`} />}
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => setClearOpen(true)} disabled={sourceEntries.length === 0 || clearing} aria-label={`清空${title}面板`} title="仅清空面板缓存，保留磁盘日志"><Trash2 className="size-3.5" /></Button>
      </div>
    </div>

    <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap gap-2"><InputGroup className="min-w-[120px] flex-1"><InputGroupInput {...inputBehavior} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`搜索${title}`} placeholder={caddy ? "搜索请求、模块或错误…" : "搜索项目或操作…"} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup><Select value={level} onValueChange={(value) => { setLevel(value); if (value === "DEBUG") setShowRoutine(true) }}><SelectTrigger className="w-[110px]" aria-label={`${title}级别`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部级别</SelectItem><SelectItem value="problems">仅异常</SelectItem><SelectItem value="INFO">信息</SelectItem><SelectItem value="WARN">警告</SelectItem><SelectItem value="ERROR">错误</SelectItem><SelectItem value="DEBUG">调试</SelectItem></SelectContent></Select></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><Label className="flex cursor-pointer items-center gap-2"><Switch checked={showRoutine} onCheckedChange={setShowRoutine} aria-label={`${title}显示${caddy ? "例行记录" : "调试记录"}`} />{caddy ? "例行记录" : "调试记录"}</Label><Label className="flex cursor-pointer items-center gap-2"><Checkbox checked={mergeRepeated} onCheckedChange={(checked) => setMergeRepeated(checked === true)} />合并重复</Label><Toggle variant="outline" size="sm" className="ml-auto" pressed={follow} onPressedChange={setFollow}>{follow ? <Check /> : <ArrowDown />}跟随最新</Toggle></div>
    </div>

    {caddy && externalCaddy && <p className="border-t bg-warning/5 px-4 py-3 text-xs leading-5 text-warning">当前连接外部 Caddy，应用无法读取该进程的输出。请到外部服务查看日志。</p>}

    <ScrollArea ref={scrollRoot} className="h-[calc(100dvh-460px)] min-h-[300px] border-t bg-muted/10" onScrollCapture={(event) => { const target = event.target as HTMLElement; if (target.hasAttribute("data-radix-scroll-area-viewport") && target.scrollHeight - target.scrollTop - target.clientHeight > 32) setFollow(false) }}>
      {groups.length === 0 ? <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 py-8 text-center"><Terminal className="mb-2 size-6 text-muted-foreground/40" /><p className="text-sm">{filteredOut ? "没有匹配的记录" : sourceEntries.length && !showRoutine ? "暂无关键事件" : "暂无记录"}</p><p className="max-w-xs text-xs leading-5 text-muted-foreground">{filteredOut ? "试试其他关键词或日志级别。" : routineCount && !showRoutine ? `已收起 ${routineCount} 条例行或调试记录，可打开上方开关查看。` : caddy ? "引擎启动和代理请求产生后，日志会出现在这里。" : "软件启停、配置变更和后端状态变化会记录在这里。"}</p>{filteredOut && <Button variant="link" size="sm" onClick={() => { setQuery(""); setLevel("all") }}>清除筛选</Button>}</div> : <div className="divide-y divide-border/60 px-4">
        {groups.map(({ key, log, firstTimestamp, count }) => {
          const data = logData(log)
          const module = typeof data.logger === "string" ? data.logger : null
          const message = module && log.message.startsWith(`[${module}] `) ? log.message.slice(module.length + 3) : log.message
          return <article key={key} className="py-3" aria-label={`${log.level} ${log.message}`}>
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"><time dateTime={log.timestamp} title={new Date(log.timestamp).toLocaleString("zh-CN")} className="tabular-nums text-muted-foreground">{formatTime(log.timestamp)}</time><span className={cn("font-semibold", levelTone[log.level])}>{log.level}</span><span className="break-all text-muted-foreground">{module || categoryLabels[log.category] || log.category}</span>{count > 1 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]" title={`首次 ${formatTime(firstTimestamp)}，最近 ${formatTime(log.timestamp)}`}>重复 {count} 次</Badge>}</div>
            <p className={cn("select-text break-words text-[13px] leading-6 [overflow-wrap:anywhere]", caddy && "font-mono text-xs", log.level === "ERROR" && "text-destructive")}>{message}</p>
            {log.data !== undefined && <DetailsSection variant="inline" className="mt-2" title={count > 1 ? "查看最近一次的原始记录" : "查看原始记录"}><pre className="max-h-56 select-text overflow-auto rounded-lg border bg-card p-3 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(log.data, null, 2)}</pre></DetailsSection>}
          </article>
        })}
      </div>}
    </ScrollArea>
    <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-[11px] leading-5 text-muted-foreground"><span>当前会话 · 最近 {sourceEntries.length} / {limit} 条</span>{!showRoutine && routineCount > 0 && <span className="ml-auto">已收起例行记录 {routineCount} 条</span>}</div>

    <AlertDialog open={clearOpen} onOpenChange={(open) => { if (!clearing) setClearOpen(open) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>清空{title}面板</AlertDialogTitle><AlertDialogDescription>{caddy ? "会清空 Caddy 来源下的请求记录与运行日志缓存，软件事件和磁盘文件会保留。" : "只清空软件事件的会话缓存，Caddy 日志、请求记录和磁盘文件会保留。"}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={clearing}>取消</AlertDialogCancel><AlertDialogAction disabled={clearing} onClick={(event) => { event.preventDefault(); void onClear().then((success) => { if (success) setClearOpen(false) }) }}>{clearing && <Loader2 className="mr-2 size-3.5 animate-spin" />}清空面板</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Card>
}

export function LogViewer(props: LogViewerProps) {
  const { caddyStatus, initialProject, onSelectProject, settings } = props
  const [view, setView] = useState<"requests" | "runtime" | "caddy">("requests")
  const { entries, loading, error, connected, subscriptionError, clearing, refresh, clear } = useLogEntries(settings.logs.entries_per_source)
  const { toast } = useToastContext()
  const engineEntries = useMemo(() => entries.filter((entry) => !proxyRequest(entry)), [entries])
  const requestCount = entries.length - engineEntries.length
  useEffect(() => { if (initialProject) setView("requests") }, [initialProject])
  const handleClear = async (source: LogSource) => {
    try { await clear(source); return true }
    catch (error) { toast({ title: "清空失败", description: error instanceof Error ? error.message : String(error), variant: "destructive" }); return false }
  }

  return <Tabs value={view} onValueChange={value => setView(value as typeof view)} className="gap-5">
    <RuntimeOverview {...props} />
    {caddyStatus?.running && !caddyStatus.reachable && <Alert variant="destructive"><AlertDescription>Caddy 进程仍在运行，但管理接口无法连接：{caddyStatus.error || "未收到响应"}。请检查管理地址，并查看 Caddy 日志中的错误。</AlertDescription></Alert>}
    <div className="flex flex-wrap items-center justify-between gap-3"><TabsList aria-label="日志类型">{([{ value: "requests", label: "请求记录", count: requestCount }, { value: "runtime", label: "软件事件", count: entries.filter((entry) => logSource(entry) === "runtime").length }, { value: "caddy", label: "Caddy 运行日志", count: engineEntries.filter((entry) => logSource(entry) === "caddy").length }] as const).map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}<Badge variant="secondary" className="tabular-nums">{item.count}</Badge></TabsTrigger>)}</TabsList><div className="flex items-center gap-2"><span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" title={subscriptionError || "通过本地应用事件接收日志"}><span className={cn("size-1.5 rounded-full", connected ? "bg-success" : "bg-warning")} />{connected ? "实时接收" : subscriptionError ? "订阅重试中" : "正在连接"}</span><Button variant="ghost" size="icon" className="size-8" onClick={() => void refresh()} disabled={loading} aria-label="刷新日志"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></Button></div></div>
    {error && <Alert variant="destructive"><AlertDescription>日志更新失败，已保留现有记录：{error}</AlertDescription></Alert>}
    {view === "requests" && caddyStatus?.reachable && !caddyStatus.managed && <Alert><AlertDescription>当前连接外部 Caddy，应用无法采集该进程的请求输出。请在外部服务中查看访问日志。</AlertDescription></Alert>}
    {view === "requests" && !settings.logs.requests_enabled && <Alert><AlertDescription>请求记录已关闭。可在「设置 → 请求与日志」中重新启用。</AlertDescription></Alert>}
    <TabsContent value="requests"><RequestLog slowRequestMs={settings.logs.slow_request_ms} entries={entries} projects={props.projects} initialProject={initialProject} onSelectProject={onSelectProject} /></TabsContent>
    <TabsContent value="runtime"><LogStream limit={settings.logs.entries_per_source} source="runtime" entries={engineEntries} externalCaddy={false} clearing={clearing === "runtime"} onClear={() => handleClear("runtime")} /></TabsContent>
    <TabsContent value="caddy"><LogStream limit={settings.logs.entries_per_source} source="caddy" entries={engineEntries} externalCaddy={!!caddyStatus?.reachable && !caddyStatus.managed} clearing={clearing === "caddy"} onClear={() => handleClear("caddy")} /></TabsContent>
  </Tabs>
}
