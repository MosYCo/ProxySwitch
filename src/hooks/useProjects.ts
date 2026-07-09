import { useState, useEffect, useCallback } from "react"
import { projectApi, envApi, proxyApi, healthApi } from "@/api"
import type { Project, Environment, HealthStatus } from "@/api"
import { useToastContext } from "@/contexts/ToastContext"

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [healthStatuses, setHealthStatuses] = useState<
    Record<string, Record<string, HealthStatus>>
  >({})
  const { toast } = useToastContext()

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      const data = await projectApi.list()
      setProjects(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "获取项目列表失败"
      setError(msg)
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHealth = useCallback(async () => {
    try {
      const data = await healthApi.getAll()
      setHealthStatuses(data && typeof data === "object" ? data : {})
    } catch (err) {
      console.error("获取健康状态失败:", err)
      setHealthStatuses({})
    }
  }, [])

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
        const msg = err instanceof Error ? err.message : "创建项目失败"
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
        const msg = err instanceof Error ? err.message : "更新项目失败"
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
        const msg = err instanceof Error ? err.message : "删除项目失败"
        setError(msg)
        toast({ title: "删除失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
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
        const msg = err instanceof Error ? err.message : "添加环境失败"
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
        const msg = err instanceof Error ? err.message : "更新环境失败"
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
        const msg = err instanceof Error ? err.message : "删除环境失败"
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
        toast({ title: "成功", description: `已切换到 ${envName}`, variant: "success" })
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : "切换环境失败"
        setError(msg)
        toast({ title: "切换失败", description: msg, variant: "destructive" })
        return false
      }
    },
    [fetchProjects, toast]
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
    // 环境操作
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    // 代理操作
    switchEnvironment,
    // 刷新
    refresh: fetchProjects,
    refreshHealth: fetchHealth,
  }
}
