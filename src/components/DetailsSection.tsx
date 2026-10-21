import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface DetailsSectionProps {
  title: ReactNode
  variant?: "panel" | "inline" | "error"
  className?: string
  disabled?: boolean
  children: ReactNode
}

// Business composition; all disclosure state, focus and keyboard behavior use
// the official Collapsible and Button components.
export function DetailsSection({ title, variant = "panel", className, disabled, children }: DetailsSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} disabled={disabled} className={cn(
      variant === "panel" && "rounded-xl border bg-card",
      variant === "error" && "rounded-lg border border-destructive/20 bg-destructive/5",
      className,
    )}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size={variant === "inline" ? "sm" : "default"}
          className={cn("group h-auto max-w-full justify-between text-left whitespace-normal",
            variant !== "inline" && "w-full p-3",
            variant === "inline" && "text-muted-foreground",
            variant === "error" && "text-destructive",
          )}>
          <span className="min-w-0">{title}</span>
          <ChevronDown className="shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent forceMount hidden={!open} className={cn(variant === "panel" ? "border-t p-4" : variant === "error" ? "p-3 pt-0" : "pt-2")}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
