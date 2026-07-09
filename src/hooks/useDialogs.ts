import { useState, useCallback } from "react"
import type { Project, Environment } from "@/api"

export function useDialogs() {
  // 项目对话框
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // 环境对话框
  const [envDialogOpen, setEnvDialogOpen] = useState(false)
  const [editingEnvName, setEditingEnvName] = useState<string | null>(null)
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null)

  const openAddProject = useCallback(() => {
    setEditingProject(null)
    setProjectDialogOpen(true)
  }, [])

  const openEditProject = useCallback((project: Project) => {
    setEditingProject(project)
    setProjectDialogOpen(true)
  }, [])

  const openAddEnv = useCallback(() => {
    setEditingEnvName(null)
    setEditingEnv(null)
    setEnvDialogOpen(true)
  }, [])

  const openEditEnv = useCallback((envName: string, env: Environment) => {
    setEditingEnvName(envName)
    setEditingEnv(env)
    setEnvDialogOpen(true)
  }, [])

  return {
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
  }
}
