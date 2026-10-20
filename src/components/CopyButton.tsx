import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToastContext } from "@/contexts/ToastContext"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
  value: string
  label: string
  className?: string
  showLabel?: boolean
}

export function CopyButton({ value, label, className, showLabel = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>()
  const { toast } = useToastContext()

  useEffect(() => {
    setCopied(false)
    clearTimeout(timeout.current)
    return () => clearTimeout(timeout.current)
  }, [value])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      clearTimeout(timeout.current)
      setCopied(true)
      timeout.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "复制失败", description: "可以选中地址后手动复制。", variant: "destructive" })
    }
  }

  return (
    <Button type="button" variant="ghost" size={showLabel ? "sm" : "icon"} className={cn("h-8 shrink-0 text-muted-foreground", !showLabel && "w-8", copied && "text-success", className)} onClick={copy} aria-label={copied ? `${label}，已复制` : label} title={copied ? "已复制" : label}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {showLabel && <span>{copied ? "已复制" : "复制入口"}</span>}
      <span className="sr-only" role="status">{copied ? "地址已复制" : ""}</span>
    </Button>
  )
}
