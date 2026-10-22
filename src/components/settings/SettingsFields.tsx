import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react"
import { Minus, Plus } from "lucide-react"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { inputBehavior } from "@/lib/inputBehavior"
import { cn } from "@/lib/utils"

export function SettingField({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  const generatedId = useId()
  const items = Children.toArray(children)
  const index = items.findIndex(isValidElement)
  const child = index >= 0 ? items[index] as ReactElement<{ id?: string; "aria-describedby"?: string }> : null
  const id = child?.props.id ?? generatedId
  const descriptionId = `${id}-description`
  if (child) items[index] = cloneElement(child, {
    id,
    "aria-describedby": [child.props["aria-describedby"], description && descriptionId].filter(Boolean).join(" ") || undefined,
  })
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>{description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}{items}</Field>
}

export function SettingSwitch({ label, description, value, onChange, disabled }: { label: string; description?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return <Field orientation="horizontal" data-disabled={disabled || undefined}>
    <FieldContent><FieldLabel htmlFor={id}>{label}</FieldLabel>{description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}</FieldContent>
    <Switch id={id} checked={value} onCheckedChange={onChange} disabled={disabled} aria-describedby={description ? `${id}-description` : undefined} />
  </Field>
}

export function SettingNumber({ label, value, onChange, min, max, placeholder }: { label: string; value: number | null | undefined; onChange: (value: number | null) => void; min: number; max: number; placeholder?: string }) {
  const id = useId()
  const adjust = (direction: number) => onChange(Math.min(max, Math.max(min, value == null ? min : value + direction)))
  return <Field><FieldLabel id={`${id}-label`} htmlFor={id}>{label}</FieldLabel><ButtonGroup aria-labelledby={`${id}-label`} className="w-full">
    <Input {...inputBehavior} id={id} type="number" min={min} max={max} step={1} value={value ?? ""} placeholder={placeholder} className="number-input min-w-0 font-mono tabular-nums"
      onChange={(event) => onChange(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null)} />
    <Button type="button" variant="outline" size="icon" aria-label={`减少${label}`} aria-controls={id} disabled={value != null && value <= min} onClick={() => adjust(-1)}><Minus /></Button>
    <Button type="button" variant="outline" size="icon" aria-label={`增加${label}`} aria-controls={id} disabled={value != null && value >= max} onClick={() => adjust(1)}><Plus /></Button>
  </ButtonGroup></Field>
}

export function SettingSelect({ label, value, onValueChange, options, disabled, className, id, "aria-describedby": describedBy }: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly { value: string; label: string; description?: string }[]
  disabled?: boolean
  className?: string
  id?: string
  "aria-describedby"?: string
}) {
  return <Select value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label} aria-describedby={describedBy} className={cn("w-full", className)}><SelectValue>{options.find(option => option.value === value)?.label}</SelectValue></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>
      <span className="flex flex-col gap-0.5"><span>{option.label}</span>{option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}</span>
    </SelectItem>)}</SelectContent>
  </Select>
}
