// API Types

export interface Environment {
  addr: string
  desc: string
  insecure_skip_verify?: boolean
}

export interface Project {
  name: string
  listen: string
  desc: string
  environments: Record<string, Environment>
  current: string
}

export interface ProjectStatus {
  name: string
  listen: string
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
  timestamp: string
  level: "DEBUG" | "INFO" | "WARN" | "ERROR"
  category: string
  message: string
  data?: unknown
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
}

export interface ApiError {
  error: string
}
