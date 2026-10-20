export const appEvents = {
  environmentSwitched: "environment-switched",
  proxyRestarted: "proxy-restarted",
  configChanged: "config-changed",
  healthUpdated: "health-updated",
  healthChanged: "health-changed",
  logCreated: "log-created",
  logsCleared: "logs-cleared",
  caddyStatusChanged: "caddy-status-changed",
} as const

export type AppEventName = typeof appEvents[keyof typeof appEvents]

export const workspaceEventNames = [
  appEvents.environmentSwitched,
  appEvents.proxyRestarted,
  appEvents.configChanged,
  appEvents.healthUpdated,
  appEvents.caddyStatusChanged,
] as const
