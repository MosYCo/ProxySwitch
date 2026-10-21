import { useState, useEffect, useCallback, useRef } from "react"
import { projectApi, envApi, proxyApi, healthApi } from "@/api"
import type { Project, Environment, HealthStatus } from "@/api"
import { useToastContext } from "@/contexts/ToastContext"
import { errorMessage } from "@/lib/errors"

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [healthStatuses, setHealthStatuses] = useState<
    Record<string, Record<string, HealthStatus>>
  >({})
  const { toast } = useToastContext()
  const projectRequest = useRef(0)
  const healthRequest = useRef(0)

  const fetchProjects = useCallback(async () => {
    const request = ++projectRequest.current
    try {
      const data = await projectApi.list()
      if (request !== projectRequest.current) return
      setProjects(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      if (request !== projectRequest.current) return
      const msg = errorMessage(err, "获取项目列表失败")
      setError(msg)
    } finally {
      if (request === projectRequest.current) setLoading(false)
    }
  }, [])

  const fetchHealth = useCallback(async () => {
    const request = ++healthRequest.current
    try {
      const data = await healthApi.getAll()
      if (request === healthRequest.current) setHealthStatuses(data && typeof data === "object" ? data : {})
    } catch (err) {
      console.error("获取健康状态失败:", err)
    }
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      await healthApi.forceCheck()
      await fetchHealth()
    } catch (error) {
      toast({ title: "健康检查失败", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    }
  }, [fetchHealth, toast])

  useEffect(() => {
    fetchProjects()
    fetchHealth()
  }, [fetchProjects, fetchHealth])

  // 项目操作
  const createProject = useCallback(
    async (project: Omit<Project, "current"> & { current?: string }) => {
      try {
        await projectApi.create(project)
        await fetchProjects()
        toast({ title: "成功", description: "项目已创建", variant: "success" })
        return true
      } catch (err) {
        const msg = errorMessage(err, "创建项目失败")
        setError(msg)
        toast({ title: "创建失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
  )

  const updateProject = useCallback(
    async (name: string, project: Partial<Project>) => {
      try {
        await projectApi.update(name, project)
        await fetchProjects()
        toast({ title: "成功", description: "项目已更新", variant: "success" })
        return true
      } catch (err) {
        const msg = errorMessage(err, "更新项目失败")
        setError(msg)
        toast({ title: "更新失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
  )

  const deleteProject = useCallback(
    async (name: string) => {
      try {
        await projectApi.delete(name)
        await fetchProjects()
        toast({ title: "成功", description: "项目已删除", variant: "success" })
        return true
      } catch (err) {
        const msg = errorMessage(err, "删除项目失败")
        setError(msg)
        toast({ title: "删除失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
  )

  const setProjectEnabled = useCallback(
    async (name: string, enabled: boolean) => {
      try {
        const result = await projectApi.setEnabled(name, enabled)
        await Promise.all([fetchProjects(), fetchHealth()])
        toast({
          title: enabled ? "项目已启用" : "项目已停用",
          description: result.applied
            ? enabled ? "代理入口已启用" : "代理入口已停用，配置已保留"
            : "启停设置已保存，下次启动 Caddy 引擎时生效",
          variant: "success",
        })
        return true
      } catch (err) {
        const msg = errorMessage(err, "更改项目启停状态失败")
        setError(msg)
        toast({ title: "操作失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, fetchHealth, toast]
  )

  // 环境操作
  const createEnvironment = useCallback(
    async (projectName: string, envName: string, env: Environment) => {
      try {
        await envApi.create(projectName, envName, env)
        await fetchProjects()
        toast({ title: "成功", description: "环境已添加", variant: "success" })
        return true
      } catch (err) {
        const msg = errorMessage(err, "添加环境失败")
        setError(msg)
        toast({ title: "添加失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
  )

  const updateEnvironment = useCallback(
    async (projectName: string, envName: string, env: Partial<Environment>) => {
      try {
        await envApi.update(projectName, envName, env)
        await fetchProjects()
        toast({ title: "成功", description: "环境已更新", variant: "success" })
        return true
      } catch (err) {
        const msg = errorMessage(err, "更新环境失败")
        setError(msg)
        toast({ title: "更新失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
  )

  const deleteEnvironment = useCallback(
    async (projectName: string, envName: string) => {
      try {
        await envApi.delete(projectName, envName)
        await fetchProjects()
        toast({ title: "成功", description: "环境已删除", variant: "success" })
        return true
      } catch (err) {
        const msg = errorMessage(err, "删除环境失败")
        setError(msg)
        toast({ title: "删除失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
  )

  // 切换环境
  const switchEnvironment = useCallback(
    async (projectName: string, envName: string) => {
      try {
        await proxyApi.switchEnv(projectName, envName)
        await fetchProjects()
        const enabled = projects.find((project) => project.name === projectName)?.enabled
        toast({ title: enabled ? "环境已切换" : "环境已选择", description: enabled ? `${projectName} 的请求现已转发至 ${envName}` : `已选择 ${envName}，启用项目后生效`, variant: "success" })
        return true
      } catch (err) {
        const msg = errorMessage(err, "切换环境失败")
        setError(msg)
        toast({ title: "切换失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, projects, toast]
  )

  return {
    projects,
    loading,
    error,
    healthStatuses,
    // 项目操作
    createProject,
    updateProject,
    deleteProject,
    setProjectEnabled,
    // 环境操作
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    // 代理操作
    switchEnvironment,
    // 刷新
    refresh: fetchProjects,
    refreshHealth: fetchHealth,
    checkHealth,
  }
}
