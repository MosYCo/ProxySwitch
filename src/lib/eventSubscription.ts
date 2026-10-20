type Unsubscribe = () => void
interface SubscriptionOptions {
  events: readonly string[]
  subscribe: (event: string, callback: (payload: unknown) => void) => Promise<Unsubscribe>
  onEvent: (event: string, payload: unknown) => void
  onStatus: (connected: boolean) => void
  onError?: (error: unknown) => void
  retryDelay?: number
}

export function createEventSubscription({ events, subscribe, onEvent, onStatus, onError, retryDelay = 3000 }: SubscriptionOptions) {
  let disposed = false
  let subscriptions: Unsubscribe[] = []
  let retry: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    for (const unsubscribe of subscriptions.splice(0)) {
      try { unsubscribe() } catch (error) { onError?.(error) }
    }
  }
  const connect = async () => {
    onStatus(false)
    try {
      for (const event of events) {
        const unsubscribe = await subscribe(event, (payload) => {
          if (!disposed) onEvent(event, payload)
        })
        if (disposed) { unsubscribe(); return }
        subscriptions.push(unsubscribe)
      }
      if (!disposed) onStatus(true)
    } catch (error) {
      cleanup()
      if (disposed) return
      onStatus(false)
      onError?.(error)
      retry = setTimeout(() => void connect(), retryDelay)
    }
  }
  void connect()
  return () => { disposed = true; clearTimeout(retry); cleanup() }
}
