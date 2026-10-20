import { type DetailsHTMLAttributes, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface DisclosureProps extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: ReactNode
  variant?: "panel" | "inline" | "error"
  contentClassName?: string
  disabled?: boolean
}

export function Disclosure({ title, variant = "panel", className, contentClassName, disabled, children, ...props }: DisclosureProps) {
  return <details {...props} className={cn("ui-disclosure group/disclosure", variant === "panel" && "rounded-xl border bg-card open:border-primary/20", variant === "error" && "rounded-lg border border-destructive/15 bg-destructive/5 text-destructive", className)}>
    <summary role="button" aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} onClick={(event) => { if (disabled) event.preventDefault() }}
      className={cn("flex cursor-pointer list-none items-center gap-2 rounded-[inherit] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/25", variant === "panel" ? "px-4 py-3.5 text-sm font-medium hover:bg-muted/40" : variant === "error" ? "px-3 py-2 text-xs hover:bg-destructive/5" : "w-fit py-1 text-xs text-muted-foreground hover:text-foreground", disabled && "cursor-not-allowed opacity-50")}>
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-current opacity-60 transition-transform duration-200 group-open/disclosure:rotate-90" />
      <span className="min-w-0 flex-1">{title}</span>
    </summary>
    <div className={cn(variant === "panel" ? "border-t p-4" : variant === "error" ? "px-3 pb-3" : "pt-1", contentClassName)}>{children}</div>
  </details>
}
