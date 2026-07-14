import { useState, useEffect } from "react"
import { Activity, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { EnvironmentCard } from "@/components/EnvironmentCard"
import { LogViewer } from "@/components/LogViewer"
import { Header } from "@/components/Header"
import { StatsBar } from "@/components/StatsBar"
import { ProjectToolbar } from "@/components/ProjectToolbar"
import { EmptyState } from "@/components/EmptyState"
import { ProjectDialog } from "@/components/dialogs/ProjectDialog"
import { EnvironmentDialog } from "@/components/dialogs/EnvironmentDialog"
import { CaddySettingsDialog } from "@/components/dialogs/CaddySettingsDialog"
import { useProjects } from "@/hooks/useProjects"
import { useWebSocket } from "@/hooks/useWebSocket"
import { useCaddyStatus } from "@/hooks/useCaddyStatus"
import { useDialogs } from "@/hooks/useDialogs"
import { proxyApi } from "@/api"
import type { Project, Environment } from "@/api"

export function Dashboard() {
  const {
    projects,
    loading,
    error,
    healthStatuses,
    createProject,
    updateProject,
    deleteProject,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    switchEnvironment,
    refresh,
    refreshHealth,
  } = useProjects()

  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [caddySettingsOpen, setCaddySettingsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [restartingProxy, setRestartingProxy] = useState(false)
  const [switchingEnv, setSwitchingEnv] = useState<string | null>(null)
  const [caddyAction, setCaddyAction] = useState<"start" | "stop" | "restart" | null>(null)

  const { isConnected, on } = useWebSocket("/ws/events")

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

  // 监听 WebSocket 事件
  useEffect(() => {
    const unsubSwitch = on("environment.switched", () => {
      refresh()
      refreshHealth()
    })
    const unsubRestart = on("proxy.restarted", () => {
      refresh()
    })
    const unsubHealth = on("health.changed", () => {
      refreshHealth()
    })

    return () => {
      unsubSwitch()
      unsubRestart()
      unsubHealth()
    }
  }, [on, refresh, refreshHealth])

  // 设置默认项目
  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProject(projects[0].name)
    } else if (
      selectedProject &&
      projects.length > 0 &&
      !projects.some((project) => project.name === selectedProject)
    ) {
      setSelectedProject(projects[0].name)
    } else if (projects.length === 0 && selectedProject) {
      setSelectedProject(null)
    }
  }, [projects, selectedProject])

  const currentProject = projects.find((p) => p.name === selectedProject)
  const projectHealth =
    selectedProject && healthStatuses[selectedProject]
      ? healthStatuses[selectedProject]
      : {}

  // 计算统计数据
  const totalEnvs = projects.reduce(
    (sum, p) => sum + (p.environments ? Object.keys(p.environments).length : 0),
    0
  )
  const healthyEnvs = Object.values(healthStatuses).reduce(
    (sum, project) =>
      sum +
      (project
        ? Object.values(project).filter((s) => s?.healthy).length
        : 0),
    0
  )
  const totalPorts = projects.map((p) => p.listen).join(", ")

  const handleSwitch = async (envName: string) => {
    if (selectedProject) {
      try {
        setSwitchingEnv(envName)
        await switchEnvironment(selectedProject, envName)
      } finally {
        setSwitchingEnv(null)
      }
    }
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await Promise.all([refresh(), refreshHealth(), refreshCaddyStatus()])
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
    } finally {
      setCaddyAction(null)
    }
  }

  const handleRestartProxy = async () => {
    try {
      setRestartingProxy(true)
      await proxyApi.restart()
      await refresh()
    } finally {
      setRestartingProxy(false)
    }
  }

  const handleSaveProject = async (
    project: Omit<Project, "current"> & { current?: string }
  ) => {
    if (editingProject) {
      return updateProject(editingProject.name, project)
    }
    return createProject(project)
  }

  const handleDeleteProject = async () => {
    if (editingProject) {
      const deleted = await deleteProject(editingProject.name)
      if (deleted) {
        setSelectedProject(null)
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background bg-grid">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 px-6">
          <Loader2 className="size-8 animate-spin text-primary" />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="h-3 w-2/3 self-center" />
            <Skeleton className="h-3 w-full" />
          </div>
          <p className="text-xs text-muted-foreground">正在加载代理配置</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Header
        isConnected={isConnected}
        isCaddyActive={isCaddyActive}
        canManageCaddy={canManageCaddy}
        caddyManaged={caddyStatus?.managed}
        onStart={() => handleCaddyAction("start")}
        onStop={() => handleCaddyAction("stop")}
        onRestart={() => handleCaddyAction("restart")}
        onRefresh={handleRefresh}
        onSettings={() => setCaddySettingsOpen(true)}
        refreshing={refreshing}
        caddyAction={caddyAction}
      />

      <main className="container flex flex-col gap-4 px-3 py-4 sm:px-4">
        {error && (
          <Alert variant="destructive">
            <Activity className="size-4" />
            <AlertTitle>代理状态异常</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 统计卡片 */}
        <StatsBar
          projectCount={projects.length}
          envCount={totalEnvs}
          healthyCount={healthyEnvs}
          ports={totalPorts}
        />

        {/* 项目工具栏 */}
        <ProjectToolbar
          projects={projects}
          selectedProject={selectedProject}
          currentProject={currentProject}
          onSelectProject={setSelectedProject}
          onAddProject={openAddProject}
          onEditProject={handleEditProject}
          onAddEnv={openAddEnv}
          onRestartProxy={handleRestartProxy}
          restartingProxy={restartingProxy}
        />

        {/* 环境列表 */}
        {currentProject && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(currentProject.environments || {}).map(
              ([envName, env]) => (
                <EnvironmentCard
                  key={envName}
                  name={envName}
                  environment={env}
                  isActive={currentProject.current === envName}
                  healthStatus={projectHealth?.[envName]}
                  onSwitch={() => handleSwitch(envName)}
                  onEdit={() => handleEditEnv(envName)}
                  onDelete={() => handleDeleteEnv(envName)}
                  switching={switchingEnv === envName}
                  disabled={switchingEnv !== null}
                />
              )
            )}
          </div>
        )}

        {/* 空状态 */}
        {projects.length === 0 && <EmptyState onAdd={openAddProject} />}

        {/* 日志 */}
        <LogViewer />
      </main>

      {/* 项目对话框 */}
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
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
          onSave={handleSaveEnv}
          onDelete={handleDeleteEnv}
        />
      )}

      <CaddySettingsDialog
        open={caddySettingsOpen}
        onOpenChange={setCaddySettingsOpen}
        onSaved={() => {
          refreshCaddyStatus()
          refresh()
        }}
      />
    </div>
  )
}
