import { Activity, Box, Briefcase, Cloud, Code2, CreditCard, Database, FlaskConical, Folder, GitBranch, Globe2, Layers, Monitor, Network, Package, Palette, Rocket, Server, Shield, ShoppingBag, Smartphone, Terminal, Wrench, Zap } from "lucide-react"
import { resolveEntityIcon, type EntityIconName } from "@/lib/entityIcons"
import { cn } from "@/lib/utils"

const icons = {
  folder: Folder, code: Code2, globe: Globe2, flask: FlaskConical, server: Server,
  "shopping-bag": ShoppingBag, "credit-card": CreditCard, database: Database, cloud: Cloud,
  monitor: Monitor, smartphone: Smartphone, terminal: Terminal, box: Box,
  "git-branch": GitBranch, layers: Layers, zap: Zap, rocket: Rocket, shield: Shield,
  briefcase: Briefcase, palette: Palette, wrench: Wrench, package: Package, activity: Activity, network: Network,
}

export function EntityIcon({ value, fallback = "folder", className }: { value?: string | null; fallback?: EntityIconName; className?: string }) {
  const icon = resolveEntityIcon(value, fallback)
  const Icon = icons[icon.name]
  return icon.emoji
    ? <span aria-hidden="true" data-entity-icon={`emoji:${icon.emoji}`} className={cn("inline-flex size-5 shrink-0 items-center justify-center text-lg leading-none", className)}>{icon.emoji}</span>
    : <Icon aria-hidden="true" data-entity-icon={icon.name} className={cn("size-5 shrink-0", className)} strokeWidth={1.8} />
}
