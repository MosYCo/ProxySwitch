import { useState } from "react"
import { Box, ChevronRight, Folder, LayoutDashboard, Loader2, Play, Plus, RotateCw, Search, Settings2, Square, Terminal, X } from "lucide-react"
import type { Project } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getProjectState, projectStateLabels } from "@/lib/projectState"
import { version } from "../../package.json"
import { productName } from "../../src-tauri/tauri.conf.json"

const appIcon = new URL("../../src-tauri/icons/app-icon.svg", import.meta.url).href

export type WorkspaceView = "overview" | "project" | "logs"

interface SidebarProps {
  projects: Project[]
  selectedProject: string | null
  view: WorkspaceView
  onViewChange: (view: WorkspaceView) => void
  onSelectProject: (name: string) => void
  onAddProject: () => void
  onSettings: () => void
  isCaddyActive: boolean
  canManageCaddy: boolean
  caddyManaged?: boolean
  statusKnown: boolean
  caddyAction: "start" | "stop" | "restart" | null
  onCaddyAction: (action: "start" | "stop" | "restart") => void
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
}

export function Sidebar(props: SidebarProps) {
  const { projects, selectedProject, view, onViewChange, onSelectProject, onAddProject, onSettings, isCaddyActive, canManageCaddy, caddyManaged, statusKnown, caddyAction, onCaddyAction, mobileOpen, onMobileOpenChange } = props
  const busy = caddyAction !== null
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filteredProjects = projects.filter((project) => !normalizedQuery || [project.name, project.desc, project.listen].some((value) => value.toLowerCase().includes(normalizedQuery)))
  const navigate = (action: () => void) => {
    action()
    onMobileOpenChange(false)
  }

  const content = (
    <>
      <div className="flex h-[76px] shrink-0 items-center gap-3 px-6">
        <img src={appIcon} alt="" className="size-10 shrink-0" draggable={false} />
        <div className="min-w-0" title={productName}>
          <div className="whitespace-nowrap text-[14px] font-semibold tracking-tight">Moss<span className="ml-1 font-normal text-muted-foreground"> ProxySwitch</span></div>
          <p className="mt-0.5 text-[10px] tracking-wide text-muted-foreground">固定入口 · 环境切换</p>
        </div>
      </div>

      <div className="px-4 pb-5 pt-4">
        <p className="section-label mb-3 px-3">工作空间</p>
        <nav aria-label="主导航" className="space-y-1">
          <button className="sidebar-link" data-active={view === "overview"} aria-current={view === "overview" ? "page" : undefined} onClick={() => navigate(() => onViewChange("overview"))}>
            <LayoutDashboard className="size-[17px]" />项目总览
            {view === "overview" && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
          </button>
          <button className="sidebar-link" data-active={view === "logs"} aria-current={view === "logs" ? "page" : undefined} onClick={() => navigate(() => onViewChange("logs"))}>
            <Terminal className="size-[17px]" />运行日志
          </button>
        </nav>
      </div>

      <div className="mx-6 border-t" />
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
        <div className="mb-3 flex items-center justify-between px-3">
          <p className="section-label">我的项目 <span className="ml-1 tracking-normal">{projects.length.toString().padStart(2, "0")}</span></p>
          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="添加项目" onClick={() => navigate(onAddProject)}><Plus className="size-3.5" /></Button>
        </div>
        {projects.length > 0 && <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery("") }} aria-label="搜索项目" placeholder="搜索项目或端口" className="h-9 bg-background/70 pl-9 pr-8 text-xs" />
          {query && <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-muted-foreground" onClick={() => setQuery("")} aria-label="清除项目搜索"><X className="size-3.5" /></Button>}
        </div>}
        <nav aria-label="项目列表" className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-3">
          {filteredProjects.map((project) => {
            const state = getProjectState(project, isCaddyActive, statusKnown)
            const active = view === "project" && selectedProject === project.name
            return <button key={project.name} className={cn("sidebar-link group gap-2.5", active && "bg-accent text-accent-foreground")} aria-label={`配置项目 ${project.name}`} aria-current={active ? "page" : undefined} onClick={() => navigate(() => onSelectProject(project.name))}>
              <Folder className={cn("size-4 shrink-0", active && "text-primary")} />
              <span className="min-w-0 flex-1" title={project.name}><span className="block truncate">{project.name}</span><span className="mt-1 flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground"><span className={cn("size-1.5 shrink-0 rounded-full", state === "running" ? "bg-success" : state === "stopped" || state === "unconfigured" ? "bg-warning" : "bg-muted-foreground/40")} />{projectStateLabels[state]}<span className="ml-auto font-mono">{project.listen}</span></span></span>
            </button>
          })}
          {projects.length > 0 && filteredProjects.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground"><p>没有匹配的项目</p><Button variant="link" size="sm" className="mt-1" onClick={() => setQuery("")}>清除搜索</Button></div>}
          {projects.length === 0 && <p className="px-3 py-2 text-xs leading-6 text-muted-foreground">项目会显示在这里，<br />从创建第一个项目开始。</p>}
          <button className="sidebar-link mt-2 text-xs" onClick={() => navigate(onAddProject)}><Plus className="size-4" />新建项目</button>
        </nav>
      </div>

      <div className="shrink-0 p-4">
        <div className="rounded-xl border bg-background/70 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold"><Box className="size-4 text-muted-foreground" />Caddy 引擎</div>
            <span className={cn("size-1.5 rounded-full", !statusKnown ? "bg-muted-foreground" : isCaddyActive ? "bg-success" : "bg-warning")} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground" role="status">{!statusKnown ? "正在获取服务状态" : isCaddyActive ? caddyManaged ? "引擎运行中 · 应用托管" : "引擎运行中 · 外部服务" : "引擎已停止"}</p>
          {statusKnown && !isCaddyActive && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">启动后为已启用的项目转发请求。</p>}
          {canManageCaddy && statusKnown && (
            <div className="mt-3 flex gap-2">
              <Button variant={caddyManaged ? "outline" : "default"} size="sm" className="flex-1" disabled={busy} onClick={() => onCaddyAction(caddyManaged ? "stop" : "start")}>
                {caddyAction === (caddyManaged ? "stop" : "start") ? <Loader2 className="size-3 animate-spin" /> : caddyManaged ? <Square className="size-3" /> : <Play className="size-3" />}
                {caddyAction === "start" ? "启动中" : caddyAction === "stop" ? "停止中" : caddyManaged ? "停止" : "启动"}
              </Button>
              {isCaddyActive && <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => onCaddyAction("restart")}>
                <RotateCw className={cn("size-3", caddyAction === "restart" && "animate-spin")} />重启
              </Button>}
            </div>
          )}
        </div>
        <button className="sidebar-link mt-3" onClick={() => navigate(onSettings)}><Settings2 className="size-4" />设置<ChevronRight className="ml-auto size-3.5" /></button>
        <p className="flex items-center justify-between gap-2 px-3 pt-3 text-[10px] tracking-wide text-muted-foreground/70"><span>{productName.toUpperCase()}</span><span>v{version}</span></p>
      </div>
    </>
  )

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[224px] flex-col border-r bg-[hsl(var(--sidebar))] md:flex">{content}</aside>
      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent className="left-0 top-0 flex h-dvh max-h-none w-[260px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 bg-[hsl(var(--sidebar))] p-0 sm:rounded-none">
          <DialogHeader className="sr-only"><DialogTitle>工作空间导航</DialogTitle><DialogDescription>切换项目、查看日志和管理 Caddy 服务。</DialogDescription></DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  )
}
