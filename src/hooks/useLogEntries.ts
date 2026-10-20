import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { logApi, type LogClearResult, type LogEntry, type LogSource } from "@/api"
import { createEventSubscription } from "@/lib/eventSubscription"
import { initialLogState, logStateReducer } from "@/lib/logPresentation"
import { appEvents } from "@/lib/appEvents"

export function useLogEntries(limit = 500) {
  const [state, dispatch] = useReducer(logStateReducer, initialLogState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)
  const [clearing, setClearing] = useState<LogSource | null>(null)
  const request = useRef(0)
  useEffect(() => { dispatch({ type: "configure", limit }) }, [limit])

  const refresh = useCallback(async () => {
    const sequence = ++request.current
    setLoading(true)
    try {
      const entries = await logApi.getRecent()
      dispatch({ type: "merge", entries: Array.isArray(entries) ? entries : [] })
      if (sequence === request.current) setError(null)
    } catch (error) {
      if (sequence === request.current) setError(error instanceof Error ? error.message : String(error))
    } finally {
      if (sequence === request.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 15000)
    window.addEventListener("focus", refresh)
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh) }
  }, [refresh])

  useEffect(() => {
    const pending: LogEntry[] = []
    let flush: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = createEventSubscription({
      events: [appEvents.logCreated, appEvents.logsCleared],
      subscribe: (event, callback) => listen(event, (message) => callback(message.payload)),
      onEvent: (event, payload) => {
        if (event === appEvents.logsCleared) dispatch({ type: "clear", result: payload as LogClearResult })
        else {
          pending.push(payload as LogEntry)
          flush ??= setTimeout(() => {
            dispatch({ type: "merge", entries: pending.splice(0) })
            flush = undefined
          }, 100)
        }
      },
      onStatus: (value) => { setConnected(value); if (value) { setSubscriptionError(null); void refresh() } },
      onError: (error) => {
        setSubscriptionError(error instanceof Error ? error.message : String(error))
        console.error("日志订阅失败，将自动重试:", error)
      },
    })
    return () => { unsubscribe(); clearTimeout(flush) }
  }, [refresh])

  const clear = useCallback(async (source: LogSource) => {
    setClearing(source)
    try { dispatch({ type: "clear", result: await logApi.clear(source) }) }
    finally { setClearing(null) }
  }, [])

  return { entries: state.entries, loading, error, connected, subscriptionError, clearing, refresh, clear }
}
