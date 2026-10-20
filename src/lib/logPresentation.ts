import type { LogClearResult, LogEntry, LogSource } from "@/api"

export interface LogState {
  limit?: number
  entries: LogEntry[]
  clearedThrough: Record<LogSource, number>
}
export const initialLogState: LogState = { entries: [], clearedThrough: { runtime: 0, caddy: 0 } }
export type LogAction = { type: "merge"; entries: LogEntry[] } | { type: "clear"; result: LogClearResult } | { type: "configure"; limit: number }
export interface LogGroup { key: string; log: LogEntry; firstTimestamp: string; count: number }

export interface ProxyRequest {
  log: LogEntry
  project: string | null
  environment: string | null
  backend: string | null
  method: string
  uri: string
  status: number | null
  durationMs: number | null
  client: string | null
}

export function proxyRequest(log: LogEntry): ProxyRequest | null {
  const data = logData(log)
  if (log.category !== "caddy" || !String(data.logger || "").startsWith("http.log.access")) return null
  const request = data.request && typeof data.request === "object" ? data.request as Record<string, unknown> : {}
  const text = (value: unknown) => typeof value === "string" && value ? value : null
  const metadata = (key: string) => {
    const value = text(data[key])
    if (!value || data.cpt_metadata_encoding !== "url") return value
    try { return decodeURIComponent(value.replace(/\+/g, "%20")) } catch { return value }
  }
  return {
    log, project: metadata("cpt_project"), environment: metadata("cpt_environment"), backend: metadata("cpt_backend"),
    method: text(request.method) || "HTTP", uri: text(data.cpt_original_uri) || text(request.uri) || "/",
    status: typeof data.status === "number" ? data.status : null,
    durationMs: typeof data.duration === "number" && Number.isFinite(data.duration) ? data.duration * 1000 : null,
    client: text(request.client_ip) || text(request.remote_ip),
  }
}

export function filterRequests(requests: ProxyRequest[], project: string | null, query: string, failuresOnly: boolean) {
  const search = query.trim().toLowerCase()
  return requests.filter((request) => (!project || request.project === project)
    && (!failuresOnly || (request.status !== null && request.status >= 400))
    && (!search || [request.project, request.environment, request.backend, request.method, request.uri, request.status, request.client].join(" ").toLowerCase().includes(search)))
}

export function logSource(log: LogEntry): LogSource { return log.category === "caddy" ? "caddy" : "runtime" }
export function logIdentity(log: LogEntry) {
  return log.id ? `id:${log.id}` : JSON.stringify([log.timestamp, log.level, log.category, log.message, log.data])
}
export function logData(log: LogEntry): Record<string, unknown> {
  return log.data && typeof log.data === "object" && !Array.isArray(log.data) ? log.data as Record<string, unknown> : {}
}

export function logStateReducer(state: LogState, action: LogAction): LogState {
  const clearedThrough = { ...state.clearedThrough }
  if (action.type === "clear") {
    for (const source of ["runtime", "caddy"] as const) {
      if (!action.result.source || action.result.source === source) clearedThrough[source] = Math.max(clearedThrough[source], action.result.through_id)
    }
  }
  const entries = new Map<string, LogEntry>()
  for (const entry of [...state.entries, ...(action.type === "merge" ? action.entries : [])]) {
    const source = logSource(entry)
    if (entry.id && entry.id <= clearedThrough[source]) continue
    if (action.type === "clear" && !entry.id && (!action.result.source || action.result.source === source)) continue
    entries.set(logIdentity(entry), entry)
  }
  const ordered = [...entries.values()].sort((a, b) => a.id && b.id ? a.id - b.id : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const counts = { runtime: 0, caddy: 0 }
  const limit = action.type === "configure" ? action.limit : state.limit ?? 500
  const retained = ordered.reverse().filter((entry) => ++counts[logSource(entry)] <= limit).reverse()
  return { entries: retained, clearedThrough, limit }
}

export function isRoutineLog(log: LogEntry) {
  const data = logData(log)
  if (log.level === "WARN" || log.level === "ERROR" || Number(data.status) >= 400) return false
  if (log.level === "DEBUG") return true
  if (log.category !== "caddy" || data.logger !== "admin.api" || data.msg !== "received request") return false
  const request = data.request && typeof data.request === "object" ? data.request as Record<string, unknown> : {}
  return (data.method ?? request.method) === "GET" && /^\/config\/?(?:\?.*)?$/.test(String(data.uri ?? request.uri ?? ""))
}

export function isProblemLog(log: LogEntry) {
  return log.level === "WARN" || log.level === "ERROR" || Number(logData(log).status) >= 400
}

export function filterLogs(logs: LogEntry[], source: LogSource, query: string, level: string, showRoutine: boolean) {
  const search = query.trim().toLowerCase()
  return logs.filter((log) => logSource(log) === source
    && (showRoutine || !isRoutineLog(log))
    && (level === "all" || (level === "problems" ? isProblemLog(log) : log.level === level))
    && (!search || `${log.message} ${log.category} ${JSON.stringify(log.data ?? "")}`.toLowerCase().includes(search)))
}

function stableData(value: unknown, root = true): unknown {
  if (Array.isArray(value)) return value.map((item) => stableData(item, false))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !root || !["ts", "time", "timestamp"].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableData(item, false)]))
}

export function groupLogs(logs: LogEntry[], mergeRepeated: boolean): LogGroup[] {
  const groups: LogGroup[] = []
  let previousSignature: string | undefined
  for (const log of logs) {
    const accessLog = String(logData(log).logger || "").startsWith("http.log.access")
    const signature = JSON.stringify([log.level, log.category, log.message, stableData(log.data)])
    const previous = groups[groups.length - 1]
    if (mergeRepeated && !accessLog && previous && signature === previousSignature) {
      previous.count++
      previous.log = log
    } else {
      groups.push({ key: logIdentity(log), log, firstTimestamp: log.timestamp, count: 1 })
    }
    previousSignature = signature
  }
  return groups
}

export function formatLogText(log: LogEntry) {
  return `${log.timestamp} [${log.level}] [${log.category}] ${log.message}${log.data ? `\n${JSON.stringify(log.data)}` : ""}`
}
