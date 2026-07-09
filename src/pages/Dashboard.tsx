import { useState, useEffect } from "react"
import { Activity } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { EnvironmentCard } from "@/components/EnvironmentCard"
import { LogViewer } from "@/components/LogViewer"
import { Header } from "@/components/Header"
import { StatsBar } from "@/components/StatsBar"
import { ProjectToolbar } from "@/components/ProjectToolbar"
import { EmptyState } from "@/components/EmptyState"
import { ProjectDialog } from "@/components/dialogs/ProjectDialog"
import { EnvironmentDialog } from "@/components/dialogs/EnvironmentDialog"
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

  const { isConnected, on } = useWebSocket("/ws/events")

  const {
    caddyStatus,
    isCaddyActive,
    canManageCaddy,
    startCaddy,
    stopCaddy,
    restartCaddy,
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
    const unsubHealth = on("health.check", () => {
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
      await switchEnvironment(selectedProject, envName)
    }
  }

  const handleRefresh = () => {
    refresh()
    refreshHealth()
  }

  const handleSaveProject = async (
    project: Omit<Project, "current"> & { current?: string }
  ) => {
    if (editingProject) {
      await updateProject(editingProject.name, project)
    } else {
      await createProject(project)
    }
  }

  const handleDeleteProject = async () => {
    if (editingProject) {
      await deleteProject(editingProject.name)
      setSelectedProject(null)
    }
  }

  const handleSaveEnv = async (name: string, env: Environment) => {
    if (selectedProject) {
      if (editingEnvName) {
        await updateEnvironment(selectedProject, name, env)
      } else {
        await createEnvironment(selectedProject, name, env)
      }
    }
  }

  const handleDeleteEnv = async (envName: string) => {
    if (selectedProject) {
      await deleteEnvironment(selectedProject, envName)
    }
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
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-2 border-primary/30 rounded-full" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-xs font-mono text-muted-foreground tracking-widest">
            初始化中...
          </p>
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
        onStart={startCaddy}
        onStop={stopCaddy}
        onRestart={restartCaddy}
        onRefresh={handleRefresh}
      />

      <main className="container px-4 py-4 space-y-4">
        {/* 错误信息 */}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-destructive text-xs font-mono">
                <Activity className="h-3.5 w-3.5" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
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
          onRestartProxy={() => proxyApi.restart()}
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
    </div>
  )
}
