import { ArrowRight, Folder, ScrollText } from "lucide-react"
import type { Project } from "@/api"
import { Button } from "@/components/ui/button"
import { getProjectState, projectStateLabels } from "@/lib/projectState"
import { projectEntryUrl } from "@/lib/projectRouting"
import { cn } from "@/lib/utils"

interface ProjectOverviewProps {
  projects: Project[]
  isCaddyActive: boolean
  statusKnown: boolean
  onOpenProject: (name: string) => void
  onViewRequests: (name: string) => void
}

export function ProjectOverview({ projects, isCaddyActive, statusKnown, onOpenProject, onViewRequests }: ProjectOverviewProps) {
  return <section aria-label="所有项目" className="grid gap-4 min-[1100px]:grid-cols-2">
    {projects.map((project) => {
      const state = getProjectState(project, isCaddyActive, statusKnown)
      const environment = project.environments[project.current]
      return <article key={project.name} className="surface flex min-w-0 flex-col p-5">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Folder className="size-5" /></div><div className="min-w-0 flex-1"><button onClick={() => onOpenProject(project.name)} className="max-w-full truncate text-left text-sm font-semibold hover:text-primary">{project.name}</button><p className="mt-1 truncate text-xs text-muted-foreground" title={project.desc}>{project.desc || `${Object.keys(project.environments).length} 个后端环境`}</p></div><span className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px]", state === "running" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}><span className={cn("size-1.5 rounded-full", state === "running" ? "bg-success" : "bg-muted-foreground/40")} />{projectStateLabels[state]}</span></div>
        <dl className="my-5 space-y-3 text-xs"><div><dt className="text-muted-foreground">代理入口</dt><dd className="mt-1 select-text break-all font-mono">{projectEntryUrl(project)}</dd></div><div><dt className="text-muted-foreground">{project.enabled ? "当前环境" : "已选环境"}</dt><dd className="mt-1 flex min-w-0 items-center gap-2"><span className="shrink-0 font-medium text-primary">{environment ? project.current : "待添加环境"}</span>{environment && <span className="truncate text-muted-foreground" title={environment.addr}>{environment.addr}</span>}</dd></div></dl>
        <div className="mt-auto flex flex-wrap justify-between gap-2 border-t pt-4"><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onViewRequests(project.name)}><ScrollText className="size-3.5" />查看请求</Button><Button variant="outline" size="sm" onClick={() => onOpenProject(project.name)}>配置项目<ArrowRight className="size-3.5" /></Button></div>
      </article>
    })}
  </section>
}
