import { useState } from "react"
import { Box, LayoutDashboard, Loader2, PanelLeftClose, PanelLeftOpen, Play, Plus, RotateCw, Search, Settings2, Square, Terminal, X } from "lucide-react"
import type { Project } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarSeparator, useSidebar } from "@/components/ui/sidebar"
import { EntityIcon } from "@/components/EntityIcon"
import { inputBehavior } from "@/lib/inputBehavior"
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
}

export function AppSidebar({ projects, selectedProject, view, onViewChange, onSelectProject, onAddProject, onSettings, isCaddyActive, canManageCaddy, caddyManaged, statusKnown, caddyAction, onCaddyAction }: SidebarProps) {
  const { isMobile, state, setOpenMobile, toggleSidebar } = useSidebar()
  const collapsed = !isMobile && state === "collapsed"
  const [query, setQuery] = useState("")
  const busy = caddyAction !== null
  const normalizedQuery = query.trim().toLowerCase()
  const filteredProjects = projects.filter(project => !normalizedQuery || [project.name, project.desc, project.listen].some(value => value.toLowerCase().includes(normalizedQuery)))
  const visibleProjects = collapsed ? projects : filteredProjects
  const navigate = (action: () => void) => { action(); setOpenMobile(false) }

  return <Sidebar collapsible="icon" aria-label="工作空间导航">
    <SidebarHeader>
      <div className={cn("flex items-center gap-1", collapsed && "justify-center")}>
        {collapsed ? <Button type="button" variant="ghost" size="icon" aria-label="展开导航" title="展开导航（Ctrl+B）" onClick={toggleSidebar}><PanelLeftOpen /></Button> : <>
        <SidebarMenu className="min-w-0 flex-1"><SidebarMenuItem><SidebarMenuButton size="lg" onClick={() => navigate(() => onViewChange("overview"))} aria-label="返回项目总览">
          <img src={appIcon} alt="" className="size-10" draggable={false} />
          <div className="grid min-w-0 text-left"><span className="truncate font-semibold" title={productName}>{productName}</span><span className="truncate text-xs text-muted-foreground">固定入口 · 环境切换</span></div>
        </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        {isMobile ? <Button variant="ghost" size="icon" aria-label="关闭导航" onClick={() => setOpenMobile(false)}><X /></Button> : <Button type="button" variant="ghost" size="icon-sm" aria-label="收起导航" title="收起导航（Ctrl+B）" onClick={toggleSidebar}><PanelLeftClose /></Button>}
        </>}
      </div>
    </SidebarHeader>
    <SidebarContent id="workspace-navigation" className="group-data-[collapsible=icon]:overflow-y-auto">
      <SidebarGroup>
        <SidebarGroupLabel>工作空间</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton tooltip="项目总览" aria-label="项目总览" isActive={view === "overview"} aria-current={view === "overview" ? "page" : undefined} onClick={() => navigate(() => onViewChange("overview"))}><LayoutDashboard />{!collapsed && <span>项目总览</span>}</SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton tooltip="运行日志" aria-label="运行日志" isActive={view === "logs"} aria-current={view === "logs" ? "page" : undefined} onClick={() => navigate(() => onViewChange("logs"))}><Terminal />{!collapsed && <span>运行日志</span>}</SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>我的项目 · {projects.length}</SidebarGroupLabel>
        <SidebarGroupAction aria-label="添加项目" title="添加项目" onClick={() => navigate(onAddProject)}><Plus /></SidebarGroupAction>
        <SidebarGroupContent className="space-y-2">
          {projects.length > 0 && !collapsed && <InputGroup>
            <InputGroupInput {...inputBehavior} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery("") }} aria-label="搜索项目" placeholder="搜索项目或端口" />
            <InputGroupAddon><Search /></InputGroupAddon>
            {query && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="清除项目搜索" onClick={() => setQuery("")}><X /></InputGroupButton></InputGroupAddon>}
          </InputGroup>}
          <SidebarMenu aria-label="项目列表">
            {visibleProjects.map(project => {
              const state = getProjectState(project, isCaddyActive, statusKnown)
              const active = view === "project" && selectedProject === project.name
              return <SidebarMenuItem key={project.name}><SidebarMenuButton size={collapsed ? "default" : "lg"} tooltip={`${project.name} · ${projectStateLabels[state]}`} isActive={active} aria-label={`配置项目 ${project.name}`} aria-current={active ? "page" : undefined} onClick={() => navigate(() => onSelectProject(project.name))}>
                <EntityIcon value={project.icon} className="size-4" />
                {!collapsed && <span className="grid min-w-0 flex-1 gap-1"><span className="truncate" title={project.name}>{project.name}</span><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 shrink-0 rounded-full", state === "running" ? "bg-success" : state === "stopped" || state === "unconfigured" ? "bg-warning" : "bg-muted-foreground/40")} />{projectStateLabels[state]}<span className="ml-auto font-mono">{project.listen}</span></span></span>}
              </SidebarMenuButton></SidebarMenuItem>
            })}
            <SidebarMenuItem><SidebarMenuButton tooltip="新建项目" aria-label="新建项目" onClick={() => navigate(onAddProject)}><Plus />{!collapsed && <span>新建项目</span>}</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
          {!collapsed && projects.length > 0 && !filteredProjects.length && <div className="p-3 text-center text-xs text-muted-foreground"><p>没有匹配的项目</p><Button variant="link" size="sm" onClick={() => setQuery("")}>清除搜索</Button></div>}
          {!collapsed && !projects.length && <p className="p-3 text-xs leading-6 text-muted-foreground">创建项目后，可在这里快速切换。</p>}
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      {collapsed ? <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip={`Caddy 引擎 · ${!statusKnown ? "正在获取状态" : isCaddyActive ? "运行中" : "已停止"}`} aria-label="查看 Caddy 引擎状态" onClick={() => navigate(() => onViewChange("logs"))}><Box className={isCaddyActive ? "text-success" : "text-muted-foreground"} /></SidebarMenuButton></SidebarMenuItem></SidebarMenu> : <Card className="gap-3 py-4">
        <CardHeader className="px-4"><CardTitle className="flex items-center gap-2 text-sm"><Box className="size-4" />Caddy 引擎<span className={cn("ml-auto size-1.5 rounded-full", !statusKnown ? "bg-muted-foreground" : isCaddyActive ? "bg-success" : "bg-warning")} /></CardTitle></CardHeader>
        <CardContent className="space-y-3 px-4">
          <p className="text-xs text-muted-foreground" role="status">{!statusKnown ? "正在获取服务状态" : isCaddyActive ? caddyManaged ? "运行中 · 应用托管" : "运行中 · 外部服务" : "引擎已停止"}</p>
          {canManageCaddy && statusKnown && <div className="flex gap-2">
            <Button variant={caddyManaged ? "outline" : "default"} size="sm" className="flex-1" disabled={busy} onClick={() => onCaddyAction(caddyManaged ? "stop" : "start")}>
              {caddyAction === (caddyManaged ? "stop" : "start") ? <Loader2 className="animate-spin" /> : caddyManaged ? <Square /> : <Play />}
              {caddyAction === "start" ? "启动中" : caddyAction === "stop" ? "停止中" : caddyManaged ? "停止" : "启动"}
            </Button>
            {isCaddyActive && <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => onCaddyAction("restart")}><RotateCw className={cn(caddyAction === "restart" && "animate-spin")} />重启</Button>}
          </div>}
        </CardContent>
      </Card>}
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="设置" aria-label="设置" onClick={() => navigate(onSettings)}><Settings2 />{!collapsed && <span>设置</span>}</SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      {!collapsed && <p className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground"><span>{productName}</span><span>v{version}</span></p>}
    </SidebarFooter>
    <SidebarRail aria-label="切换导航边栏" title={collapsed ? "展开导航" : "收起导航"} />
  </Sidebar>
}
