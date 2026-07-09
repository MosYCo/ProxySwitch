import { useEffect, useRef, useCallback, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

interface WebSocketEvent {
  type: string
  data: unknown
}

type EventHandler = (event: WebSocketEvent) => void

/**
 * useWebSocket - Tauri event adapter
 *
 * In the Tauri version, this uses Tauri's event system instead of WebSocket.
 * The API is kept compatible with the original for minimal code changes.
 */
export function useWebSocket(_url: string) {
  const [isConnected] = useState(true) // Tauri events are always "connected"
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const unlistenFns = useRef<UnlistenFn[]>([])

  useEffect(() => {
    // Listen for all relevant events from the backend
    const eventTypes = [
      "environment.switched",
      "proxy.restarted",
      "health.changed",
      "log.created",
    ]

    const setupListeners = async () => {
      for (const eventType of eventTypes) {
        const unlisten = await listen(eventType, (event) => {
          const data: WebSocketEvent = {
            type: eventType,
            data: event.payload,
          }

          // Notify specific handlers
          const handlers = handlersRef.current.get(eventType)
          if (handlers) {
            handlers.forEach((handler) => handler(data))
          }

          // Notify wildcard handlers
          const wildcardHandlers = handlersRef.current.get("*")
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => handler(data))
          }
        })
        unlistenFns.current.push(unlisten)
      }
    }

    setupListeners()

    return () => {
      unlistenFns.current.forEach((unlisten) => unlisten())
      unlistenFns.current = []
    }
  }, [])

  const on = useCallback((eventType: string, handler: EventHandler) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set())
    }
    handlersRef.current.get(eventType)!.add(handler)

    return () => {
      handlersRef.current.get(eventType)?.delete(handler)
    }
  }, [])

  const off = useCallback((eventType: string, handler: EventHandler) => {
    handlersRef.current.get(eventType)?.delete(handler)
  }, [])

  return { isConnected, on, off }
}
