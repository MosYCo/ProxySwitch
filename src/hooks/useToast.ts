import { useCallback } from "react"
import { toast as sonnerToast } from "sonner"

export interface Toast {
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success" | "warning"
  duration?: number
}

export type ToastId = string | number

export function useToast() {
  const toast = useCallback(({ title, description, variant, duration }: Toast): ToastId => {
    const notify = variant === "destructive" ? sonnerToast.error : variant === "success" ? sonnerToast.success : variant === "warning" ? sonnerToast.warning : sonnerToast
    return notify(title || "通知", { description, duration })
  }, [])
  const dismiss = useCallback((id: ToastId) => { sonnerToast.dismiss(id) }, [])
  return { toast, dismiss }
}
