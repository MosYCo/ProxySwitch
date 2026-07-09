import { createContext, useContext, type ReactNode } from "react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast, type Toast as ToastType } from "@/hooks/useToast"

interface ToastContextValue {
  toast: (props: Omit<ToastType, "id">) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToastContext() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToastContext must be used within ToastProvider")
  }
  return ctx
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  const { toasts, toast, dismiss } = useToast()

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      <ToastProvider>
        {children}
        {toasts.map((t: ToastType) => (
          <Toast key={t.id} variant={t.variant} onOpenChange={() => dismiss(t.id)}>
            <div className="grid gap-1">
              {t.title && <ToastTitle>{t.title}</ToastTitle>}
              {t.description && <ToastDescription>{t.description}</ToastDescription>}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  )
}
