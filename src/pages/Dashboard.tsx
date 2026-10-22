import { inputBehavior } from "@/lib/inputBehavior"
import { useState, useEffect } from "react"
import { Activity, Layers, Plus, Search, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { EnvironmentCard } from "@/components/EnvironmentCard"
import { LogViewer } from "@/components/LogViewer"
import { WorkspaceHeader } from "@/components/WorkspaceHeader"
import { AppSidebar, type WorkspaceView } from "@/components/Sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Badge } from "@/components/ui/badge"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToastContext } from "@/contexts/ToastContext"
import { StatsBar } from "@/components/StatsBar"
import { ProjectToolbar } from "@/components/ProjectToolbar"
import { ProjectOverview } from "@/components/ProjectOverview"
import { EmptyState } from "@/components/EmptyState"
import { ProjectDialog } from "@/components/dialogs/ProjectDialog"
import { EnvironmentDialog } from "@/components/dialogs/EnvironmentDialog"
import { SettingsDialog } from "@/components/dialogs/SettingsDialog"
import { UpdateDialog } from "@/components/dialogs/UpdateDialog"
import { useAppUpdater } from "@/hooks/useAppUpdater"
import { useAppSettings } from "@/hooks/useAppSettings"
import { healthCheckEnabled, resolveProxyOptions } from "@/lib/settings"
import { useProjects } from "@/hooks/useProjects"
import { useWebSocket } from "@/hooks/useWebSocket"
import { useCaddyStatus } from "@/hooks/useCaddyStatus"
import { useDialogs } from "@/hooks/useDialogs"
import { proxyApi } from "@/api"
import { hasProxyRoute } from "@/lib/projectRouting"
import { appEvents } from "@/lib/appEvents"
import type { Project, Environment } from "@/api"

export function Dashboard() {
  const updater = useAppUpdater()
  const { settings, refresh: refreshSettings } = useAppSettings()
  const {
    projects,
    loading,
    error,
    healthStatuses,
    createProject,
    updateProject,
    deleteProject,
    setProjectEnabled,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    switchEnvironment,
    refresh,
    refreshHealth,
    checkHealth,
  } = useProjects()

  const [selectedProject, setSelectedProject] = useState<string | null>(() => {
    try { return localStorage.getItem("caddy-desk:last-project") } catch { return null }
  })
  const [view, setView] = useState<WorkspaceView>("overview")
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem("caddy-proxy-tools.sidebar-open") !== "false" } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem("caddy-proxy-tools.sidebar-open", String(sidebarOpen)) } catch { /* Layout preferences are optional. */ }
  }, [sidebarOpen])
  const [logProject, setLogProject] = useState<string | null>(null)
  const [envQuery, setEnvQuery] = useState("")
  const [envFilter, setEnvFilter] = useState<"all" | "active" | "unhealthy">("all")
  const { toast } = useToastContext()
  const [caddySettingsOpen, setCaddySettingsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [restartingProxy, setRestartingProxy] = useState(false)
  const [switchingEnv, setSwitchingEnv] = useState<{ project: string; environment: string } | null>(null)
  const [caddyAction, setCaddyAction] = useState<"start" | "stop" | "restart" | null>(null)
  const [changingProject, setChangingProject] = useState<string | null>(null)

  const { isConnected, connectionError, on } = useWebSocket("/ws/events")

  const {
    caddyStatus,
    isCaddyActive,
    canManageCaddy,
    startCaddy,
    stopCaddy,
    restartCaddy,
    refresh: refreshCaddyStatus,
  } = useCaddyStatus(() => {
    refresh()
    refreshHealth()
  })

  const {
    projectDialogOpen,
    setProjectDialogOpen,
    editingProject,
    envDialogOpen,
    setEnvDialogOpen,
    editingEnvName,
    editingEnv,
    openAddProject,
    openEditProject,
    openAddEnv,
    openEditEnv,
  } = useDialogs()

  // 监听桌面应用事件
  useEffect(() => {
    const unsubSwitch = on(appEvents.environmentSwitched, () => {
      refresh()
      refreshHealth()
    })
    const unsubRestart = on(appEvents.proxyRestarted, () => {
      refresh()
    })
    const unsubHealth = on(appEvents.healthUpdated, () => {
      refreshHealth()
    })
    const unsubConfig = on(appEvents.configChanged, () => { refresh(); refreshHealth(); refreshSettings() })
    const unsubCaddy = on(appEvents.caddyStatusChanged, () => { refreshCaddyStatus() })

    return () => {
      unsubSwitch()
      unsubRestart()
      unsubHealth()
      unsubConfig()
      unsubCaddy()
    }
  }, [on, refresh, refreshHealth, refreshCaddyStatus, refreshSettings])

  useEffect(() => {
    if (isConnected) { refresh(); refreshHealth() }
  }, [isConnected, refresh, refreshHealth])

  // 设置默认项目
  useEffect(() => {
    if (loading) return
    if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0].name)
    } else if (
      selectedProject &&
      projects.length > 0 &&
      !projects.some((project) => project.name === selectedProject)
    ) {
      setSelectedProject(projects[0].name)
      setView((current) => current === "project" ? "overview" : current)
    } else if (projects.length === 0 && selectedProject) {
      setSelectedProject(null)
      setView((current) => current === "project" ? "overview" : current)
    }
  }, [projects, selectedProject, loading])

  const currentProject = projects.find((p) => p.name === selectedProject)
  useEffect(() => {
    if (loading || !currentProject) return
    try { localStorage.setItem("caddy-desk:last-project", currentProject.name) } catch { /* Preferences are optional when storage is unavailable. */ }
  }, [loading, currentProject?.name])

  const projectHealth = selectedProject ? healthStatuses[selectedProject] || {} : {}
  const environments = Object.entries(currentProject?.environments || {}).sort(([a], [b]) => Number(b === currentProject?.current) - Number(a === currentProject?.current) || a.localeCompare(b, "zh-CN", { numeric: true }))
  const checkedTargets = enabledProjectsForHealth(projects, settings)
  const unhealthyCount = currentProject?.enabled ? environments.filter(([name, env]) => healthCheckEnabled(settings, currentProject, name, env) && projectHealth[name]?.healthy === false).length : 0
  const filteredEnvironments = environments.filter(([name, env]) => {
    const query = envQuery.trim().toLowerCase()
    return (envFilter === "all" || (envFilter === "active" && name === currentProject?.current) || (envFilter === "unhealthy" && currentProject && healthCheckEnabled(settings, currentProject, name, env) && projectHealth[name]?.healthy === false)) &&
      (!query || [name, env.desc, env.addr].some((value) => value.toLowerCase().includes(query)))
  })

  useEffect(() => {
    setEnvQuery("")
    setEnvFilter("all")
  }, [selectedProject])
  // 计算统计数据
  const totalEnvs = projects.reduce(
    (sum, p) => sum + (p.environments ? Object.keys(p.environments).length : 0),
    0
  )
  const enabledProjects = projects.filter((project) => project.enabled)
  const checkedEnvs = checkedTargets.length
  const testedEnvs = checkedTargets.filter(([project, name]) => healthStatuses[project]?.[name] !== undefined).length
  const healthyEnvs = checkedTargets.filter(([project, name]) => healthStatuses[project]?.[name]?.healthy).length
  const totalPorts = projects.filter(hasProxyRoute).map((p) => p.listen)

  const handleViewChange = (nextView: WorkspaceView) => {
    if (nextView === "logs") setLogProject(null)
    setView(nextView)
    window.scrollTo({ top: 0 })
  }

  const handleOpenProject = (name: string) => {
    setSelectedProject(name)
    handleViewChange("project")
  }

  const handleProjectRequests = (name: string) => {
    setLogProject(name)
    setView("logs")
    window.scrollTo({ top: 0 })
  }

  const handleSwitch = async (envName: string) => {
    if (selectedProject) {
      try {
        setSwitchingEnv({ project: selectedProject, environment: envName })
        await switchEnvironment(selectedProject, envName)
      } finally {
        setSwitchingEnv(null)
      }
    }
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await Promise.all([refresh(), checkHealth(), refreshCaddyStatus()])
    } finally {
      setRefreshing(false)
    }
  }

  const handleCaddyAction = async (action: "start" | "stop" | "restart") => {
    try {
      setCaddyAction(action)
      if (action === "start") {
        await startCaddy()
      } else if (action === "stop") {
        await stopCaddy()
      } else {
        await restartCaddy()
      }
    } catch (err) {
      toast({ title: "服务操作失败", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setCaddyAction(null)
    }
  }

  const handleRestartProxy = async () => {
    try {
      setRestartingProxy(true)
      await proxyApi.restart()
      await refresh()
      toast({ title: "配置已重载", description: "代理配置已更新", variant: "success" })
    } catch (err) {
      toast({ title: "重载失败", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setRestartingProxy(false)
    }
  }

  const handleProjectEnabledChange = async (enabled: boolean) => {
    if (!selectedProject) return
    const name = selectedProject
    setChangingProject(name)
    try {
      await setProjectEnabled(name, enabled)
    } finally {
      setChangingProject(null)
    }
  }

  const handleSaveProject = async (
    project: Omit<Project, "current"> & { current?: string }
  ) => {
    if (editingProject) {
      return updateProject(editingProject.name, project)
    }
    const saved = await createProject(project)
    if (saved) handleOpenProject(project.name)
    return saved
  }

  const handleDeleteProject = async () => {
    if (editingProject) {
      const deleted = await deleteProject(editingProject.name)
      if (deleted) {
        setSelectedProject(null)
        setView("overview")
      }
      return deleted
    }
    return false
  }

  const handleSaveEnv = async (name: string, env: Environment) => {
    if (selectedProject) {
      if (editingEnvName) {
        return updateEnvironment(selectedProject, name, env)
      }
      return createEnvironment(selectedProject, name, env)
    }
    return false
  }

  const handleDeleteEnv = async (envName: string) => {
    if (selectedProject) {
      return deleteEnvironment(selectedProject, envName)
    }
    return false
  }

  const handleEditProject = () => {
    if (currentProject) {
      openEditProject(currentProject)
    }
  }

  const handleEditEnv = (envName: string) => {
    if (currentProject?.environments?.[envName]) {
      openEditEnv(envName, currentProject.environments[envName])
    }
  }

  return (
    <TooltipProvider delayDuration={200}><SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} className="bg-background">
      <AppSidebar
        projects={projects}
        selectedProject={selectedProject}
        view={view}
        onViewChange={handleViewChange}
        onSelectProject={handleOpenProject}
        onAddProject={openAddProject}
        onSettings={() => setCaddySettingsOpen(true)}
        onUpdates={() => updater.setOpen(true)}
        updateAvailable={!!updater.release}
        isCaddyActive={isCaddyActive}
        canManageCaddy={canManageCaddy}
        caddyManaged={caddyStatus?.managed}
        statusKnown={caddyStatus !== null}
        caddyAction={caddyAction}
        onCaddyAction={handleCaddyAction}
      />
      <SidebarInset className="min-w-0">
        <WorkspaceHeader title={view === "overview" ? "项目总览" : view === "logs" ? "运行日志" : currentProject?.name || "项目配置"} isConnected={isConnected} syncError={connectionError} onRefresh={handleRefresh} refreshing={refreshing} />
        <div className="workspace-content">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{view === "overview" ? "项目总览" : view === "logs" ? "运行日志" : "项目配置"}</h1>
              <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{view === "overview" ? "查看所有项目的运行状态，选择项目进入配置。" : view === "logs" ? "按项目追踪请求，查看转发目标、响应状态和耗时。" : "管理当前项目的启停、代理入口与后端环境。"}</p>
            </div>
            {view === "overview" && <Button onClick={openAddProject}><Plus className="size-4" />新建项目</Button>}
          </div>
          {error && (
            <Alert variant="destructive">
              <Activity className="size-4" />
              <AlertTitle>操作未完成</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1 break-words">{error}</span><Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>刷新状态</Button></AlertDescription>
            </Alert>
          )}

          {view === "overview" && <div className="page-enter flex flex-col gap-6">
            {loading ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="status" aria-label="正在加载代理配置">
                {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-[112px] rounded-xl" />)}
              </div>
            ) : <StatsBar
              projectCount={projects.length}
              enabledProjectCount={enabledProjects.length}
              envCount={totalEnvs}
              checkedEnvCount={checkedEnvs}
              testedEnvCount={testedEnvs}
              healthyCount={healthyEnvs}
              ports={totalPorts}
              isCaddyActive={isCaddyActive}
              statusKnown={caddyStatus !== null}
            />}
            {!loading && projects.length > 0 && <ProjectOverview projects={projects} isCaddyActive={isCaddyActive} statusKnown={caddyStatus !== null} onOpenProject={handleOpenProject} onViewRequests={handleProjectRequests} />}
            {!loading && projects.length === 0 && <EmptyState onAdd={openAddProject} />}
          </div>}

          {view === "project" && currentProject && <div className="page-enter flex flex-col gap-6">
            <ProjectToolbar
              project={currentProject}
              onEditProject={handleEditProject}
              onViewRequests={() => handleProjectRequests(currentProject.name)}
              onRestartProxy={handleRestartProxy}
              restartingProxy={restartingProxy}
              isCaddyActive={isCaddyActive}
              statusKnown={caddyStatus !== null}
              canStartCaddy={canManageCaddy}
              startingCaddy={caddyAction === "start"}
              onStartCaddy={() => handleCaddyAction("start")}
              onAddEnvironment={openAddEnv}
              onChooseEnvironment={() => {
                setEnvFilter("all")
                setEnvQuery("")
                document.getElementById("environments-heading")?.focus()
                document.getElementById("environments-heading")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
              }}
              onEnabledChange={handleProjectEnabledChange}
              changingEnabled={changingProject === currentProject.name}
              disabled={changingProject !== null || caddyAction !== null || switchingEnv !== null}
            />

            {currentProject && (
              <section aria-labelledby="environments-heading">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 id="environments-heading" tabIndex={-1} className="flex scroll-mt-24 items-center gap-2 text-[15px] font-semibold">后端环境<span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{environments.length}</span></h2>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{caddyStatus === null ? "正在确认引擎状态。" : !isCaddyActive ? "添加、编辑或切换环境前，请先启动 Caddy 引擎。" : currentProject.enabled ? "当前选择置顶，切换后立即更新此项目的转发目标。" : "项目已停用，选择环境后需启用项目才会转发请求。"}</p>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <InputGroup className="min-w-0 flex-1 sm:w-[190px]">
                      <InputGroupInput {...inputBehavior} value={envQuery} onChange={(event) => setEnvQuery(event.target.value)} placeholder="搜索环境或地址…" aria-label="搜索环境或地址" />
                      <InputGroupAddon><Search /></InputGroupAddon>
                      {envQuery && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="清除环境搜索" onClick={() => setEnvQuery("")}><X /></InputGroupButton></InputGroupAddon>}
                    </InputGroup>
                    <Button variant="outline" onClick={openAddEnv}><Plus />添加环境</Button>
                  </div>
                </div>
                <div className="my-4 flex flex-wrap items-center gap-3">
                  <ToggleGroup type="single" variant="outline" value={envFilter} onValueChange={value => { if (value) setEnvFilter(value as typeof envFilter) }} aria-label="环境筛选">
                  {([{ value: "all", label: "全部环境", count: environments.length }, { value: "active", label: "当前选择", count: currentProject.environments[currentProject.current] ? 1 : 0 }, { value: "unhealthy", label: "连接异常", count: unhealthyCount }] as const).map((filter) => (
                    <ToggleGroupItem key={filter.value} value={filter.value}>
                      {filter.label}<Badge variant="secondary" className={cn("tabular-nums", filter.value === "unhealthy" && filter.count > 0 && "bg-destructive/10 text-destructive")}>{filter.count}</Badge>
                    </ToggleGroupItem>
                  ))}
                  </ToggleGroup>
                  {envQuery && <span className="ml-auto text-xs text-muted-foreground" role="status">找到 {filteredEnvironments.length} 个环境</span>}
                </div>
                <div className="grid items-stretch gap-4 min-[1100px]:grid-cols-2 min-[1600px]:grid-cols-3">
                  {filteredEnvironments.map(
                    ([envName, env]) => (
                      <EnvironmentCard
                        key={envName}
                        name={envName}
                        environment={env}
                        isActive={currentProject.current === envName}
                        projectEnabled={currentProject.enabled}
                        isCaddyActive={isCaddyActive}
                        statusKnown={caddyStatus !== null}
                        healthStatus={currentProject.enabled ? projectHealth?.[envName] : undefined}
                        healthCheckEnabled={healthCheckEnabled(settings, currentProject, envName, env)}
                        onSwitch={() => handleSwitch(envName)}
                        onEdit={() => handleEditEnv(envName)}
                        onDelete={() => handleDeleteEnv(envName)}
                        switching={switchingEnv?.project === currentProject.name && switchingEnv.environment === envName}
                        disabled={switchingEnv !== null || changingProject !== null || caddyAction !== null}
                      />
                    )
                  )}
                </div>
                {filteredEnvironments.length === 0 && <Empty className="border bg-card py-10">
                  <EmptyHeader><EmptyMedia variant="icon">{environments.length === 0 ? <Layers /> : <Search />}</EmptyMedia>
                    <EmptyTitle>{environments.length === 0 ? "给项目添加第一个环境" : envFilter === "unhealthy" && !envQuery ? currentProject.enabled ? "当前没有连接异常的环境" : "项目已停用，健康检查已暂停" : "没有找到匹配的环境"}</EmptyTitle>
                    <EmptyDescription>{environments.length === 0 ? "填写环境名称和后端地址，第一个环境会自动选中。" : envFilter === "unhealthy" && !envQuery ? "可在全部环境中查看每个后端的检查状态。" : "试试其他关键词，或清除筛选查看全部环境。"}</EmptyDescription>
                  </EmptyHeader>
                  <Button variant="outline" onClick={environments.length === 0 ? openAddEnv : () => { setEnvQuery(""); setEnvFilter("all") }}>{environments.length === 0 ? "添加环境" : "查看全部环境"}</Button>
                </Empty>}
              </section>
            )}

          </div>}

          {view === "logs" && <LogViewer settings={settings} caddyStatus={caddyStatus} projects={projects} healthStatuses={healthStatuses} isConnected={isConnected} syncError={connectionError} initialProject={logProject} onSelectProject={handleOpenProject} />}
          <footer className="flex flex-wrap items-center justify-between gap-2 pb-1 text-[10px] text-muted-foreground/70"><span>每一条线路，都清晰可见。</span><span>Powered by Caddy</span></footer>
        </div>
      </SidebarInset>

      {/* 项目对话框 */}
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
        projects={projects}
        proxyDefaults={settings.proxy}
        onSave={handleSaveProject}
        onDelete={handleDeleteProject}
      />

      {/* 环境对话框 */}
      {selectedProject && (
        <EnvironmentDialog
          open={envDialogOpen}
          onOpenChange={setEnvDialogOpen}
          envName={editingEnvName}
          environment={editingEnv}
          isCurrent={editingEnvName === currentProject?.current}
          proxyDefaults={resolveProxyOptions(settings.proxy, currentProject?.proxy)}
          onSave={handleSaveEnv}
          onDelete={handleDeleteEnv}
        />
      )}

      <SettingsDialog
        projects={projects}
        open={caddySettingsOpen}
        onOpenChange={setCaddySettingsOpen}
        onSaved={() => {
          refreshCaddyStatus()
          refresh()
          refreshSettings()
          refreshHealth()
        }}
      />
      <UpdateDialog updater={updater} editing={projectDialogOpen || envDialogOpen || caddySettingsOpen} />
    </SidebarProvider></TooltipProvider>
  )
}

function enabledProjectsForHealth(projects: Project[], settings: import("@/api").AppSettings) {
  return projects.flatMap((project) => Object.entries(project.environments).filter(([name, env]) => healthCheckEnabled(settings, project, name, env)).map(([name]) => [project.name, name] as const))
}
