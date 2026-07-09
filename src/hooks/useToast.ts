import { useState, useCallback, useRef } from "react"

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success" | "warning"
  duration?: number
}

let toastCount = 0

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = String(++toastCount)
      const duration = toast.duration ?? 4000

      setToasts((prev) => [...prev, { ...toast, id }])

      if (duration > 0) {
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
          timersRef.current.delete(id)
        }, duration)
        timersRef.current.set(id, timer)
      }

      return id
    },
    []
  )

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (props: Omit<Toast, "id">) => addToast(props),
    [addToast]
  )

  return { toasts, toast, dismiss }
}
