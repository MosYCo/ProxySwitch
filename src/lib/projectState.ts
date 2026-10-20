import type { Project } from "@/api"

export type ProjectState = "disabled" | "unconfigured" | "checking" | "stopped" | "running"

export const projectStateLabels: Record<ProjectState, string> = {
  disabled: "已停用",
  unconfigured: "待配置环境",
  checking: "正在确认状态",
  stopped: "等待引擎启动",
  running: "代理运行中",
}

export function getProjectState(project: Pick<Project, "enabled" | "current" | "environments">, engineActive: boolean, statusKnown = true): ProjectState {
  if (!project.enabled) return "disabled"
  if (!Object.prototype.hasOwnProperty.call(project.environments, project.current)) return "unconfigured"
  if (!statusKnown) return "checking"
  return engineActive ? "running" : "stopped"
}
