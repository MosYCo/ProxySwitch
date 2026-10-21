import { createContext, useContext, useMemo, type ReactNode } from "react"
import { Toaster } from "@/components/ui/sonner"
import { useToast, type Toast, type ToastId } from "@/hooks/useToast"
import { useTheme } from "@/contexts/ThemeContext"

interface ToastContextValue {
  toast: (props: Toast) => ToastId
  dismiss: (id: ToastId) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToastContext() {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToastContext must be used within AppToastProvider")
  return context
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  const { toast, dismiss } = useToast()
  const { resolvedTheme } = useTheme()
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])
  return <ToastContext.Provider value={value}>{children}<Toaster theme={resolvedTheme} richColors closeButton /></ToastContext.Provider>
}
