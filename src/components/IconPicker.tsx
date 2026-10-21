import { useId, useState } from "react"
import { Check, ChevronsUpDown, RotateCcw, Search } from "lucide-react"
import { EntityIcon } from "@/components/EntityIcon"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { emojiIcons, entityIcons, normalizeEmoji, resolveEntityIcon, type EntityIconName } from "@/lib/entityIcons"
import { inputBehavior } from "@/lib/inputBehavior"

export function IconPicker({ label, value, onChange, fallback = "folder", disabled }: { label: string; value: string | null; onChange: (value: string | null) => void; fallback?: EntityIconName; disabled?: boolean }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [customEmoji, setCustomEmoji] = useState("")
  const resolved = resolveEntityIcon(value, fallback)
  const select = (icon: string | null) => { onChange(icon); setOpen(false) }
  const normalized = normalizeEmoji(customEmoji)
  const options = entityIcons.filter(icon => `${icon.id} ${icon.label}`.includes(query.trim().toLowerCase()))

  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Popover open={open} onOpenChange={next => { setOpen(next); if (next) { setQuery(""); setCustomEmoji(value?.startsWith("emoji:") ? value.slice(6) : "") } }}>
      <PopoverTrigger asChild><Button type="button" id={id} variant="outline" className="w-full justify-start" disabled={disabled} aria-label={`选择${label}`} aria-describedby={`${id}-hint`}>
        <EntityIcon value={value} fallback={fallback} className="size-4" /><span className="flex-1 text-left">{value ? resolved.label : `自动 · ${resolved.label}`}</span><ChevronsUpDown className="text-muted-foreground" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[min(352px,calc(100vw-2rem))] p-4" aria-label={`选择${label}`}>
        <Tabs defaultValue={value?.startsWith("emoji:") ? "emoji" : "icons"} className="gap-3">
          <TabsList className="w-full" aria-label="图标类型"><TabsTrigger value="icons">内置图标</TabsTrigger><TabsTrigger value="emoji">Emoji</TabsTrigger></TabsList>
          <TabsContent value="icons" className="space-y-3">
            <InputGroup><InputGroupInput {...inputBehavior} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索图标…" aria-label="搜索图标" /><InputGroupAddon><Search /></InputGroupAddon></InputGroup>
            <div className="grid grid-cols-6 gap-1.5">{options.map(icon => <Tooltip key={icon.id}><TooltipTrigger asChild><Button type="button" variant={value === icon.id ? "secondary" : "outline"} size="icon" className="relative size-10" aria-label={`选择图标：${icon.label}`} aria-pressed={value === icon.id} onClick={() => select(icon.id)}>
              <EntityIcon value={icon.id} />{value === icon.id && <Check className="absolute right-0.5 bottom-0.5 size-2.5 text-primary" />}
            </Button></TooltipTrigger><TooltipContent>{icon.label}</TooltipContent></Tooltip>)}</div>
            {!options.length && <p className="py-4 text-center text-xs text-muted-foreground">没有匹配的图标</p>}
          </TabsContent>
          <TabsContent value="emoji" className="space-y-3">
            <div className="grid grid-cols-6 gap-1.5">{emojiIcons.map(icon => <Button key={icon} type="button" variant={value === `emoji:${icon}` ? "secondary" : "outline"} size="icon" className="size-10 text-xl" aria-label={`选择 Emoji：${icon}`} aria-pressed={value === `emoji:${icon}`} onClick={() => select(`emoji:${icon}`)}>{icon}</Button>)}</div>
            <div className="space-y-2 border-t pt-3"><Label htmlFor={`${id}-emoji`}>自定义 Emoji</Label><div className="flex gap-2"><Input {...inputBehavior} id={`${id}-emoji`} value={customEmoji} maxLength={32} onChange={event => setCustomEmoji(event.target.value)} placeholder="粘贴一个 Emoji，例如 🌱" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (normalized) select(`emoji:${normalized}`) } }} /><Button type="button" disabled={!normalized} onClick={() => { if (normalized) select(`emoji:${normalized}`) }}>使用</Button></div></div>
          </TabsContent>
        </Tabs>
        <Button type="button" variant="ghost" className="mt-3 w-full border-t" onClick={() => select(null)}><RotateCcw />恢复自动图标</Button>
      </PopoverContent>
    </Popover>
    <FieldDescription id={`${id}-hint`}>选择内置图标或 Emoji，也可以保持自动匹配。</FieldDescription>
  </Field>
}
