import { useId, type ReactNode } from "react"
import { NumberInput } from "@/components/ui/number-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export function SettingField({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return <div className="space-y-2"><div className="text-sm font-medium">{label}</div>{description && <p className="text-xs leading-5 text-muted-foreground">{description}</p>}{children}</div>
}
export function SettingSwitch({ label, description, value, onChange, disabled }: { label: string; description?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return <div className="flex items-center justify-between gap-5 py-1"><div><label htmlFor={id} className="cursor-pointer text-sm font-medium">{label}</label>{description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}</div><Switch id={id} checked={value} onCheckedChange={onChange} disabled={disabled} /></div>
}
export function SettingNumber({ label, value, onChange, min, max, placeholder }: { label: string; value: number | null | undefined; onChange: (value: number | null) => void; min: number; max: number; placeholder?: string }) {
  const id = useId()
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><NumberInput id={id} label={label} min={min} max={max} value={value} onValueChange={onChange} placeholder={placeholder} /></div>
}

export function SettingSelect({ label, value, onValueChange, options, disabled, className }: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly { value: string; label: string; description?: string }[]
  disabled?: boolean
  className?: string
}) {
  return <Select value={value} onValueChange={onValueChange} disabled={disabled}><SelectTrigger aria-label={label} className={className}><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value} description={option.description}>{option.label}</SelectItem>)}</SelectContent></Select>
}
