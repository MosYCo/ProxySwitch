// API Types

export interface Environment {
  icon?: string | null
  proxy?: ProxyOptions
  health?: HealthOverride
  addr: string
  desc: string
  insecure_skip_verify?: boolean
}

export interface Project {
  icon?: string | null
  proxy?: ProxyOptions
  health?: HealthOverride
  route_prefix?: string | null
  rewrite_prefix?: string | null
  name: string
  listen: string
  enabled: boolean
  path_prefix?: boolean
  strip_prefix?: boolean
  desc: string
  environments: Record<string, Environment>
  current: string
}

export interface ProjectActivation {
  project: Project
  applied: boolean
}

export interface ProjectStatus {
  name: string
  listen: string
  enabled: boolean
  current_env: string
  backend_addr: string
}

export interface HealthStatus {
  healthy: boolean
  last_check: string
  error?: string
  latency_ms?: number
}

export interface LogEntry {
  id?: number
  timestamp: string
  level: "DEBUG" | "INFO" | "WARN" | "ERROR"
  category: string
  message: string
  data?: unknown
}

export type LogSource = "runtime" | "caddy"

export interface LogClearResult {
  source: LogSource | null
  through_id: number
}

export interface CaddyStatus {
  running: boolean
  managed: boolean
  pid: number
  uptime_secs: number
  reachable: boolean
  error?: string
}

export interface CaddySettings {
  admin: string
  applied: boolean
}

export interface ApiError {
  error: string
}

export interface ProxyOptions {
  connect_timeout_ms?: number | null
  response_timeout_ms?: number | null
  host?: string | null
  request_headers?: Record<string, string | null>
  response_headers?: Record<string, string | null>
}
export interface HealthOverride {
  enabled?: boolean | null
  timeout_ms?: number | null
  path?: string | null
  expected_statuses?: number[] | null
  fallback_to_root?: boolean | null
}
export interface AppSettings {
  startup: { launch_at_login: boolean; start_caddy: boolean; start_hidden: boolean; close_action: "tray" | "quit" }
  logs: { requests_enabled: boolean; entries_per_source: number; retention_days: number; slow_request_ms: number; ignored_paths: string[]; redacted_query_params: string[]; caddy_level: "DEBUG" | "INFO" | "WARN" | "ERROR" }
  health: { enabled: boolean; interval_secs: number; timeout_ms: number; path: string; expected_statuses: number[]; only_current: boolean; fallback_to_root: boolean }
  backup: { enabled: boolean; max_backups: number }
  caddy: { auto_restart: boolean; restart_attempts: number }
  proxy: ProxyOptions
}
export interface SettingsView { admin: string; settings: AppSettings; autostart_supported: boolean; backup_dir: string }
export interface ImportPreview { projects: string[]; replaced: string[] }
export interface BackupInfo { id: string; projects: number }
