import { invoke } from "@tauri-apps/api/core"
import type {
  Project,
  Environment,
  ProjectStatus,
  HealthStatus,
  LogEntry,
  CaddyStatus,
  CaddySettings,
} from "./types"

// Project API
export const projectApi = {
  list: () => invoke<Project[]>("list_projects"),

  get: (name: string) => invoke<Project>("get_project", { name }),

  create: (project: Omit<Project, "current"> & { current?: string }) =>
    invoke<Project>("create_project", { project }),

  update: (name: string, project: Partial<Project>) =>
    invoke<Project>("update_project", { name, project }),

  delete: (name: string) => invoke<void>("delete_project", { name }),
}

// Environment API
export const envApi = {
  list: (projectName: string) =>
    invoke<Record<string, Environment>>("list_environments", { projectName }),

  get: (projectName: string, envName: string) =>
    invoke<Environment>("get_environment", { project: projectName, name: envName }),

  create: (projectName: string, envName: string, env: Environment) =>
    invoke<void>("create_environment", { project: projectName, name: envName, env }),

  update: (projectName: string, envName: string, env: Partial<Environment>) =>
    invoke<void>("update_environment", { project: projectName, name: envName, env }),

  delete: (projectName: string, envName: string) =>
    invoke<void>("delete_environment", { project: projectName, name: envName }),
}

// Proxy API
export const proxyApi = {
  switchEnv: (projectName: string, envName: string) =>
    invoke<void>("switch_environment", { project: projectName, environment: envName }),

  restart: () => invoke<void>("restart_proxy"),

  status: () => invoke<ProjectStatus[]>("get_proxy_status"),

  health: () => invoke<Record<string, Record<string, HealthStatus>>>("get_health_status"),
}

// Health API
export const healthApi = {
  getAll: () => invoke<Record<string, Record<string, HealthStatus>>>("get_health_status"),

  forceCheck: () => invoke<void>("force_health_check"),
}

// Log API
export const logApi = {
  getAll: (limit?: number) => invoke<LogEntry[]>("get_logs", { limit }),

  getByLevel: (level: string) => invoke<LogEntry[]>("get_logs_by_level", { level }),

  getByCategory: (category: string) =>
    invoke<LogEntry[]>("get_logs_by_category", { category }),

  getRecent: (limit: number = 100) => invoke<LogEntry[]>("get_logs", { limit }),

  clear: () => invoke<void>("clear_logs"),
}

// Caddy API
export const caddyApi = {
  getStatus: () => invoke<CaddyStatus>("get_caddy_status"),

  getSettings: () => invoke<CaddySettings>("get_caddy_settings"),

  updateSettings: (admin: string) =>
    invoke<CaddySettings>("update_caddy_settings", { admin }),

  start: () => invoke<void>("start_caddy"),

  stop: () => invoke<void>("stop_caddy"),

  restart: () => invoke<void>("restart_caddy"),
}
