import { useState } from "react"
import { AlertCircle, ArrowLeftRight, Check, CheckCheck, Loader2, Lock, MoreHorizontal, Pencil, Trash2, Zap } from "lucide-react"
import type { Environment, HealthStatus } from "@/api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DetailsSection } from "@/components/DetailsSection"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CopyButton } from "@/components/CopyButton"
import { EntityIcon } from "@/components/EntityIcon"
import { environmentAppearance } from "@/lib/entityIcons"
import { cn } from "@/lib/utils"

interface EnvironmentCardProps {
  name: string
  environment: Environment
  isActive: boolean
  projectEnabled?: boolean
  isCaddyActive: boolean
  statusKnown: boolean
  healthStatus?: HealthStatus
  healthCheckEnabled?: boolean
  onSwitch: () => void
  onEdit?: () => void
  onDelete?: () => Promise<boolean> | boolean
  switching?: boolean
  disabled?: boolean
}

function formatLastCheck(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function EnvironmentCard({ name, environment, isActive, projectEnabled = true, isCaddyActive, statusKnown, healthStatus, healthCheckEnabled = true, onSwitch, onEdit, onDelete, switching = false, disabled = false }: EnvironmentCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const serving = isActive && projectEnabled && isCaddyActive && statusKnown
  const checking = projectEnabled && healthCheckEnabled
  const isHealthy = checking ? healthStatus?.healthy : undefined
  const latency = healthStatus?.latency_ms
  const lastCheck = checking ? formatLastCheck(healthStatus?.last_check) : null
  const { icon, color } = environmentAppearance(name)
  const secure = environment.addr.startsWith("https://")

  const deleteEnvironment = async () => {
    if (!onDelete) return
    try {
      setDeleting(true)
      if (await onDelete()) setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card className={cn("relative min-w-0 gap-0 overflow-hidden p-5", isActive ? "border-primary bg-accent/60 ring-1 ring-primary/30" : "border-border bg-card")} role="region" aria-label={`环境 ${name}`} aria-busy={switching || deleting}>
        {isActive && <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <Badge variant={isActive ? "default" : "outline"}>{isActive ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-muted-foreground/50" />}{isActive ? serving ? "正在使用 · 当前转发" : "已选择 · 待生效" : "未使用"}</Badge>
          {isActive && <span className="text-xs font-medium text-primary">{serving ? "请求将转发至此环境" : !projectEnabled ? "启用项目后生效" : !statusKnown ? "正在确认引擎状态" : "启动引擎后生效"}</span>}
        </div>
        <div className="flex items-start gap-3">
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", color)}><EntityIcon value={environment.icon} fallback={icon} /></div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="truncate text-sm font-semibold" title={name}>{name}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={environment.desc}>{environment.desc || "未添加环境描述"}</p>
          </div>
          {(onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 size-7 shrink-0 text-muted-foreground" disabled={disabled} aria-label={`打开环境 ${name} 的更多操作`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuGroup>
                  {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil />编辑环境</DropdownMenuItem>}
                  {onDelete && <DropdownMenuItem disabled={isActive} title={isActive ? "请先切换到其他环境再删除" : undefined} className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 />{isActive ? "当前环境不可删除" : "删除环境"}</DropdownMenuItem>}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>后端地址</span><span className="flex items-center gap-1">{secure && <Lock className="size-2.5" />}{secure ? "HTTPS" : "HTTP"}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 select-text break-all text-[13px] leading-5">{environment.addr}</code>
            <CopyButton value={environment.addr} label={`复制环境 ${name} 的后端地址`} className="-mr-1" />
          </div>
        </div>

        {isHealthy === false && healthStatus?.error && <DetailsSection variant="error" className="mt-3 text-xs" title={<span className="flex items-center gap-1.5 leading-5"><AlertCircle className="size-3.5 shrink-0" />后端连接异常，查看原因</span>}><p className="select-text break-all leading-5">{healthStatus.error}</p><p className="mt-2 leading-5 text-muted-foreground">请检查后端服务和网络，或切换到其他可用环境。</p></DetailsSection>}

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col gap-1" title={!checking ? "健康检查已关闭或此环境不在检查范围" : lastCheck ? `最近检查 ${lastCheck}` : "等待健康检查"}>
              <div className={cn("flex items-center gap-1.5 text-xs", isHealthy === undefined ? "text-muted-foreground" : isHealthy ? "text-success" : "text-destructive")}>
                <span className={cn("size-1.5 rounded-full", isHealthy === undefined ? "bg-muted-foreground/40" : isHealthy ? "bg-success" : "bg-destructive")} />
                {!projectEnabled ? "项目已停用" : !checking ? "未启用检查" : isHealthy === undefined ? "待检测" : isHealthy ? "连接正常" : "连接异常"}
                {isHealthy && latency !== undefined && <span className="ml-1 flex items-center gap-0.5 text-muted-foreground"><Zap className="size-2.5" />{latency} ms</span>}
              </div>
              <span className="text-[11px] text-muted-foreground">{!checking ? "健康检查已暂停" : lastCheck ? `${lastCheck} 检查` : "自动检测后端可用性"}</span>
            </div>
            {isActive ? <div role="status" aria-label="环境使用状态" className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-primary"><CheckCheck className="size-4" />{serving ? "正在使用" : "已选择 · 待生效"}</div> : <Button variant="outline" onClick={onSwitch} disabled={disabled || switching || !isCaddyActive || !statusKnown} title={!statusKnown ? "正在确认引擎状态" : !isCaddyActive ? "请先启动 Caddy 引擎，再切换环境" : undefined}>
              {switching ? <Loader2 className="size-3 animate-spin" /> : <ArrowLeftRight className="size-3" />}
              {switching ? "正在切换" : !statusKnown ? "等待引擎状态" : !isCaddyActive ? "启动引擎后切换" : projectEnabled ? "切换到此环境" : "选择此环境"}
            </Button>}
          </div>
        </div>
      </Card>

      {onDelete && <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>删除环境</AlertDialogTitle><AlertDialogDescription>将删除环境「{name}」。此操作不可撤销。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void deleteEnvironment() }}>{deleting && <Loader2 className="mr-2 size-3.5 animate-spin" />}{deleting ? "删除中" : "确认删除"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </>
  )
}
