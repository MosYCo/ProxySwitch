import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input, type InputProps } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface NumberInputProps extends Omit<InputProps, "type" | "value" | "onChange" | "min" | "max" | "step"> {
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  min: number
  max: number
  step?: number
  label: string
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, min, max, step = 1, label, className, disabled, readOnly, ...props }, ref) => {
    const adjust = (direction: number) => {
      const next = value == null ? min : value + direction * step
      onValueChange(Math.min(max, Math.max(min, next)))
    }
    return <div className={cn("flex h-10 min-w-0 items-center rounded-lg border border-input bg-card transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/15 [&:has(input:disabled)]:opacity-50", className)}>
      <Input {...props} ref={ref} type="number" min={min} max={max} step={step} disabled={disabled} readOnly={readOnly} value={value ?? ""}
        className="number-input h-full min-w-0 flex-1 border-0 bg-transparent font-mono tabular-nums focus-visible:ring-0 disabled:opacity-100"
        onChange={(event) => onValueChange(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null)} />
      <div className="mr-1 flex shrink-0 items-center gap-0.5 border-l pl-1">
        <Button type="button" variant="ghost" size="icon" className="size-7 rounded-md text-muted-foreground" aria-label={`减少${label}`} aria-controls={props.id} disabled={disabled || readOnly || (value != null && value <= min)} onClick={() => adjust(-1)}><Minus className="size-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-7 rounded-md text-muted-foreground" aria-label={`增加${label}`} aria-controls={props.id} disabled={disabled || readOnly || (value != null && value >= max)} onClick={() => adjust(1)}><Plus className="size-3.5" /></Button>
      </div>
    </div>
  }
)
NumberInput.displayName = "NumberInput"

export { NumberInput }
