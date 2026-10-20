import { ArrowRight, Check, GitBranch, Info, Loader2, Pause, Pencil, Play, Plus, RefreshCw, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { CopyButton } from "@/components/CopyButton"
import type { Project } from "@/api"
import { projectEntryUrl } from "@/lib/projectRouting"
import { getProjectState, projectStateLabels } from "@/lib/projectState"
import { cn } from "@/lib/utils"

interface ProjectToolbarProps {
  project: Project
  onEditProject: () => void
  onViewRequests: () => void
  onRestartProxy: () => void
  restartingProxy?: boolean
  isCaddyActive: boolean
  statusKnown: boolean
  canStartCaddy: boolean
  startingCaddy: boolean
  onStartCaddy: () => void
  onAddEnvironment: () => void
  onChooseEnvironment: () => void
  onEnabledChange: (enabled: boolean) => void
  changingEnabled?: boolean
  disabled?: boolean
}

export function ProjectToolbar({ project, onEditProject, onViewRequests, onRestartProxy, restartingProxy = false, isCaddyActive, statusKnown, canStartCaddy, startingCaddy, onStartCaddy, onAddEnvironment, onChooseEnvironment, onEnabledChange, changingEnabled = false, disabled = false }: ProjectToolbarProps) {
  const activeEnvironment = project.environments?.[project.current]
  const state = getProjectState(project, isCaddyActive, statusKnown)
  const running = state === "running"
  const statusText = projectStateLabels[state]
  const busy = disabled || changingEnabled || restartingProxy
  const hasEnvironments = Object.keys(project.environments).length > 0
  const notice = !statusKnown ? "正在确认引擎状态，请稍候。"
    : !isCaddyActive ? "Caddy 引擎已停止。启动后，已启用的项目才会接收请求。"
    : state === "disabled" ? "此项目已停用，不会转发请求或检查后端。环境配置会保留。"
    : state === "unconfigured" ? hasEnvironments ? "还没有选择转发目标，请从下方选择一个环境。" : "先添加一个后端环境，即可开始使用这个代理入口。"
    : null

  return (
    <section className="surface overflow-hidden" aria-label="当前项目">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 xl:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><GitBranch className="size-5" strokeWidth={1.7} /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="truncate text-[17px] font-semibold tracking-tight" title={project.name}>{project.name}</h2>
              <Badge variant={running ? "success" : "secondary"} className="gap-1.5 text-[11px] font-normal"><span className={cn("size-1.5 rounded-full", running ? "bg-success" : "bg-muted-foreground")} />{statusText}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{project.desc || "管理这个项目的代理入口与后端环境"}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onViewRequests}><ScrollText className="size-3.5" />查看请求</Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onEditProject} disabled={busy}><Pencil className="size-3.5" />编辑项目</Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" title="重新应用所有已启用项目的配置，通常无需手动操作" onClick={onRestartProxy} disabled={busy || !isCaddyActive || !statusKnown}>
            {restartingProxy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{restartingProxy ? "重载中" : "重载配置"}
          </Button>
        </div>
      </div>
      <div className="mx-5 mb-4 flex items-center justify-between gap-4 rounded-lg border bg-muted/25 px-4 py-3 xl:mx-6">
        <label htmlFor="project-enabled" className="flex flex-1 cursor-pointer items-center gap-3">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", project.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {changingEnabled ? <Loader2 className="size-4 animate-spin" /> : project.enabled ? <Check className="size-4" /> : <Pause className="size-4" />}
          </span>
          <span><span className="block text-[13px] font-medium">启用此项目</span><span id="project-enabled-hint" className="mt-0.5 block text-xs text-muted-foreground">{project.enabled ? "关闭后仅停用此项目，其他项目继续运行" : "开启后恢复此项目的代理与健康检查"}</span></span>
        </label>
        <Switch id="project-enabled" checked={project.enabled} onCheckedChange={onEnabledChange} disabled={busy} aria-describedby="project-enabled-hint" />
      </div>
      <div className="grid items-center gap-3 border-t bg-muted/20 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:px-6">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">本地代理入口</p>
          <div className="flex min-w-0 items-center gap-2"><code className="min-w-0 flex-1 select-text break-all text-[13px]" title={projectEntryUrl(project)}>{projectEntryUrl(project)}</code><CopyButton value={projectEntryUrl(project)} label="复制本地代理入口" /></div>
        </div>
        <ArrowRight className="hidden size-5 text-muted-foreground/50 sm:block" />
        <div className="min-w-0 sm:pl-2">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">转发至后端 {activeEnvironment && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{project.current}</span>}</p>
          <div className="flex min-w-0 items-center gap-2"><code className="min-w-0 flex-1 select-text break-all text-[13px]">{activeEnvironment?.addr || "尚未选择环境"}</code>{activeEnvironment && <CopyButton value={activeEnvironment.addr} label="复制当前后端地址" />}</div>
        </div>
      </div>
      {notice && <div className="flex flex-wrap items-center gap-3 border-t bg-accent/30 px-5 py-3 text-xs xl:px-6" role="status">
        <Info className="size-4 shrink-0 text-primary" /><p className="min-w-[180px] flex-1 leading-5 text-muted-foreground">{notice}</p>
        {statusKnown && !isCaddyActive && canStartCaddy && <Button size="sm" onClick={onStartCaddy} disabled={busy || startingCaddy}>{startingCaddy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}{startingCaddy ? "正在启动" : "启动引擎"}</Button>}
        {isCaddyActive && state === "unconfigured" && <Button size="sm" onClick={hasEnvironments ? onChooseEnvironment : onAddEnvironment} disabled={busy}>{hasEnvironments ? <ArrowRight className="size-3.5" /> : <Plus className="size-3.5" />}{hasEnvironments ? "选择环境" : "添加第一个环境"}</Button>}
      </div>}
    </section>
  )
}
