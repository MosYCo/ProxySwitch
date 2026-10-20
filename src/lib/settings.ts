import type { AppSettings, Environment, Project, ProxyOptions } from "@/api"

export const defaultSettings: AppSettings = {
  startup: { launch_at_login: false, start_caddy: true, start_hidden: false, close_action: "tray" },
  logs: { requests_enabled: true, entries_per_source: 500, retention_days: 0, slow_request_ms: 1000, ignored_paths: [], redacted_query_params: ["token", "access_token", "password", "secret", "api_key"], caddy_level: "INFO" },
  health: { enabled: true, interval_secs: 30, timeout_ms: 5000, path: "/health", expected_statuses: [], only_current: false, fallback_to_root: true },
  backup: { enabled: true, max_backups: 10 }, caddy: { auto_restart: false, restart_attempts: 3 }, proxy: {},
}

export function healthCheckEnabled(settings: AppSettings, project: Project, name: string, environment: Environment) {
  return project.enabled && settings.health.enabled && (!settings.health.only_current || project.current === name)
    && (environment.health?.enabled ?? project.health?.enabled ?? true)
}
export function parseStatusCodes(text: string) {
  if (!text.trim()) return []
  const codes = text.split(/[,，\s]+/).filter(Boolean).map(Number)
  if (codes.some((code) => !Number.isInteger(code) || code < 100 || code > 599)) throw new Error("状态码须为 100–599 的整数，以逗号分隔")
  return [...new Set(codes)]
}
export function parseHeaderRules(text: string) {
  const rules: Record<string, string | null> = {}
  for (const line of text.split("\n").filter((value) => value.trim())) {
    const trimmed = line.trim()
    const colon = trimmed.indexOf(":")
    const remove = trimmed.startsWith("-") && colon === -1
    const name = (remove ? trimmed.slice(1) : trimmed.slice(0, colon)).trim().toLowerCase()
    if ((!remove && colon < 1) || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) throw new Error(`Header 格式无效：${line}。使用 名称: 值，删除时使用 -名称`)
    if (Object.prototype.hasOwnProperty.call(rules, name)) throw new Error(`Header 重复：${name}`)
    if (name === "host") throw new Error("请使用专用 Host 字段设置主机名")
    rules[name] = remove ? null : trimmed.slice(colon + 1).trim()
  }
  return rules
}
export function formatHeaderRules(rules?: Record<string, string | null>) {
  return Object.entries(rules || {}).map(([name, value]) => value === null ? `-${name}` : `${name}: ${value}`).join("\n")
}
export function resolveProxyOptions(...levels: (ProxyOptions | undefined)[]): ProxyOptions {
  const normalized = (rules?: Record<string, string | null>) => Object.fromEntries(Object.entries(rules || {}).map(([key, value]) => [key.toLowerCase(), value]))
  return levels.reduce<ProxyOptions>((previous, next) => ({
    connect_timeout_ms: next?.connect_timeout_ms ?? previous.connect_timeout_ms,
    response_timeout_ms: next?.response_timeout_ms ?? previous.response_timeout_ms,
    host: next?.host ?? previous.host,
    request_headers: { ...previous.request_headers, ...normalized(next?.request_headers) },
    response_headers: { ...previous.response_headers, ...normalized(next?.response_headers) },
  }), {})
}
