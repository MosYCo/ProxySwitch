import { useState, useEffect, useCallback } from "react"
import { caddyApi } from "@/api"

export interface CaddyStatus {
  running: boolean
  managed: boolean
  pid: number
  uptime_secs: number
  reachable: boolean
  error?: string
}

export function useCaddyStatus(refreshDeps?: () => void) {
  const [caddyStatus, setCaddyStatus] = useState<CaddyStatus | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const caddy = await caddyApi.getStatus()
      setCaddyStatus(caddy)
    } catch {
      setCaddyStatus(null)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const isCaddyActive = caddyStatus?.reachable || caddyStatus?.running || false
  const canManageCaddy = caddyStatus?.managed || !isCaddyActive

  const startCaddy = useCallback(async () => {
    try { await caddyApi.start() }
    finally { await fetchStatus(); refreshDeps?.() }
  }, [fetchStatus, refreshDeps])

  const stopCaddy = useCallback(async () => {
    try { await caddyApi.stop() }
    finally { await fetchStatus(); refreshDeps?.() }
  }, [fetchStatus, refreshDeps])

  const restartCaddy = useCallback(async () => {
    try { await caddyApi.restart() }
    finally { await fetchStatus(); refreshDeps?.() }
  }, [fetchStatus, refreshDeps])

  return {
    caddyStatus,
    isCaddyActive,
    canManageCaddy,
    startCaddy,
    stopCaddy,
    restartCaddy,
    refresh: fetchStatus,
  }
}
