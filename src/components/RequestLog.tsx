import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowRight, Check, Search, Waypoints } from "lucide-react"
import type { LogEntry, Project } from "@/api"
import { Button } from "@/components/ui/button"
import { Disclosure } from "@/components/ui/disclosure"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CopyButton } from "@/components/CopyButton"
import { filterRequests, formatLogText, logIdentity, proxyRequest, type ProxyRequest } from "@/lib/logPresentation"
import { cn } from "@/lib/utils"

interface RequestLogProps {
  slowRequestMs: number
  entries: LogEntry[]
  projects: Project[]
  initialProject: string | null
  onSelectProject: (name: string) => void
}

function duration(value: number | null) {
  if (value === null) return "耗时未记录"
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(value < 10 ? 1 : 0)} ms`
}

function RequestRow({ request, onSelectProject, slowRequestMs }: { request: ProxyRequest; onSelectProject?: () => void; slowRequestMs: number }) {
  const { log, project, environment, backend, method, uri, status, durationMs, client } = request
  return <article className="px-5 py-4" aria-label={`${project || "项目未标记"} ${method} ${uri} ${status ?? ""}`}>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {onSelectProject ? <button className="max-w-full truncate text-sm font-semibold text-primary hover:underline" onClick={onSelectProject}>{project}</button> : <span className="max-w-full truncate text-sm font-semibold">{project || "项目未标记"}</span>}
      <ArrowRight className="size-3 text-muted-foreground" /><span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">{environment || "环境未记录"}</span>
      <time className="ml-auto tabular-nums text-muted-foreground" dateTime={log.timestamp} title={new Date(log.timestamp).toLocaleString("zh-CN")}>{new Date(log.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</time>
    </div>
    <div className="mt-3 flex flex-wrap items-start gap-2.5">
      <span className="rounded border bg-info/5 px-2 py-0.5 font-mono text-xs font-semibold text-info">{method}</span>
      <code className="min-w-0 flex-1 select-text break-all text-[13px] leading-6">{uri}</code>
      <span className={cn("rounded px-2 py-0.5 font-mono text-xs font-semibold", status === null ? "bg-muted text-muted-foreground" : status >= 500 ? "bg-destructive/10 text-destructive" : status >= 400 ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>{status ?? "—"}</span>
      <span className="py-0.5 text-xs tabular-nums text-muted-foreground">{duration(durationMs)}</span>
      {durationMs !== null && durationMs >= slowRequestMs && <span className="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">慢请求</span>}
    </div>
    <p className="mt-2 select-text break-all text-xs leading-5 text-muted-foreground">转发至 <span className="font-mono text-foreground/80">{backend || "目标后端未记录"}</span></p>
    <Disclosure title="请求详情与原始日志" variant="inline" className="mt-2 text-xs text-muted-foreground"><p>请求来源：{client || "未记录"}</p><pre className="mt-2 max-h-64 select-text overflow-auto rounded-lg border bg-muted/30 p-3 text-[11px] leading-5">{JSON.stringify(log.data, null, 2)}</pre></Disclosure>
  </article>
}

export function RequestLog({ entries, projects, initialProject, onSelectProject, slowRequestMs }: RequestLogProps) {
  const [project, setProject] = useState<string | null>(initialProject)
  const [query, setQuery] = useState("")
  const [failuresOnly, setFailuresOnly] = useState(false)
  const [follow, setFollow] = useState(true)
  const scrollRoot = useRef<HTMLDivElement>(null)
  const requests = useMemo(() => entries.map(proxyRequest).filter((request): request is ProxyRequest => request !== null), [entries])
  const names = useMemo(() => [...new Set([...projects.map((project) => project.name), ...requests.flatMap((request) => request.project ? [request.project] : []), ...(project ? [project] : [])])].sort((a, b) => a.localeCompare(b, "zh-CN")), [projects, requests, project])
  const filtered = useMemo(() => filterRequests(requests, project, query, failuresOnly), [requests, project, query, failuresOnly])
  const failures = filtered.filter((request) => request.status !== null && request.status >= 400).length
  useEffect(() => { setProject(initialProject) }, [initialProject])
  useEffect(() => {
    if (!follow) return
    const viewport = scrollRoot.current?.querySelector('[data-slot="scroll-area-viewport"]')
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [filtered, follow])

  return <section className="surface overflow-hidden" aria-label="项目请求记录">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h3 className="text-sm font-semibold">请求记录 <span className="ml-2 text-xs font-normal text-muted-foreground">{filtered.length} 条 · {failures} 条异常</span></h3><p className="mt-1.5 text-xs text-muted-foreground">查看哪个项目收到了请求，以及当时转发到的环境和后端。</p></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" aria-pressed={follow} onClick={() => setFollow(!follow)}>{follow ? <Check className="size-3.5" /> : <ArrowDown className="size-3.5" />}跟随最新</Button>{filtered.length > 0 && <CopyButton value={filtered.map((request) => formatLogText(request.log)).join("\n\n")} label="复制当前显示的请求记录" />}</div></div>
    <div className="flex flex-wrap gap-2 bg-muted/20 px-5 py-3">
      <Select value={project ? `project:${project}` : "all"} onValueChange={(value) => setProject(value === "all" ? null : value.slice(8))}><SelectTrigger className="h-9 w-full bg-card text-xs sm:w-[190px]" aria-label="按项目筛选请求"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部项目</SelectItem>{names.map((name) => <SelectItem key={name} value={`project:${name}`}>{name}</SelectItem>)}</SelectContent></Select>
      <div className="relative min-w-[150px] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索路径、环境或目标后端…" aria-label="搜索请求记录" className="h-9 pl-9 text-xs" /></div>
      <Button variant={failuresOnly ? "secondary" : "outline"} size="sm" className="h-9" aria-pressed={failuresOnly} onClick={() => setFailuresOnly(!failuresOnly)}>仅看异常</Button>
    </div>
    <ScrollArea ref={scrollRoot} className="h-[calc(100dvh-440px)] min-h-[320px] border-t" onScrollCapture={(event) => { const target = event.target as HTMLElement; if (target.hasAttribute("data-radix-scroll-area-viewport") && target.scrollHeight - target.scrollTop - target.clientHeight > 32) setFollow(false) }}>
      {filtered.length ? <div className="divide-y">{filtered.map((request) => <RequestRow slowRequestMs={slowRequestMs} key={logIdentity(request.log)} request={request} onSelectProject={request.project && projects.some((project) => project.name === request.project) ? () => onSelectProject(request.project!) : undefined} />)}</div> : <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"><Waypoints className="size-7 text-muted-foreground/40" /><h3 className="text-sm font-medium">{requests.length ? "没有匹配的请求" : "还没有代理请求"}</h3><p className="max-w-md text-xs leading-6 text-muted-foreground">{requests.length ? "调整项目、关键词或异常筛选，查看其他请求。" : "通过项目的本地代理入口发送请求后，可在这里查看。更新后的配置需重载或重启引擎生效。"}</p>{(project || query || failuresOnly) && <Button variant="outline" size="sm" onClick={() => { setProject(null); setQuery(""); setFailuresOnly(false) }}>清除筛选</Button>}</div>}
    </ScrollArea>
    {requests.some((request) => !request.project) && <p className="border-t px-5 py-2.5 text-xs leading-5 text-muted-foreground">未标记的记录可能来自旧配置或未匹配项目的请求；重载配置后，新匹配请求会记录项目与环境。</p>}
  </section>
}
