import { useEffect, useRef, useCallback, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { createEventSubscription } from "@/lib/eventSubscription"
import { workspaceEventNames, type AppEventName } from "@/lib/appEvents"
interface WebSocketEvent { type: string; data: unknown }
type EventHandler = (event: WebSocketEvent) => void

export function useWebSocket(_url: string) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  useEffect(() => createEventSubscription({
    events: workspaceEventNames,
    subscribe: (event, callback) => listen(event, (message) => callback(message.payload)),
    onStatus: (connected) => { setIsConnected(connected); if (connected) setConnectionError(null) },
    onError: (error) => {
      setConnectionError(error instanceof Error ? error.message : String(error))
      console.error("实时事件订阅失败，将自动重试:", error)
    },
    onEvent: (type, data) => {
      for (const handler of handlersRef.current.get(type) || []) handler({ type, data })
      for (const handler of handlersRef.current.get("*") || []) handler({ type, data })
    },
  }), [])
  const on = useCallback((type: AppEventName | "*", handler: EventHandler) => {
    if (!handlersRef.current.has(type)) handlersRef.current.set(type, new Set())
    handlersRef.current.get(type)!.add(handler)
    return () => { handlersRef.current.get(type)?.delete(handler) }
  }, [])
  const off = useCallback((type: AppEventName | "*", handler: EventHandler) => { handlersRef.current.get(type)?.delete(handler) }, [])
  return { isConnected, connectionError, on, off }
}
