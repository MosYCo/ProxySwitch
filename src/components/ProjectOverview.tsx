import { ArrowRight, ScrollText } from "lucide-react"
import { EntityIcon } from "@/components/EntityIcon"
import type { Project } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
    {projects.map(project => {
      const state = getProjectState(project, isCaddyActive, statusKnown)
      const environment = project.environments[project.current]
      return <Card key={project.name}>
        <CardHeader>
          <div className="flex items-start gap-3"><EntityIcon value={project.icon} className="mt-1 size-5 text-primary" /><div className="min-w-0 flex-1">
            <CardTitle><Button variant="link" className="h-auto max-w-full justify-start p-0 text-foreground" onClick={() => onOpenProject(project.name)}><span className="truncate">{project.name}</span></Button></CardTitle>
            <CardDescription className="mt-1 truncate" title={project.desc}>{project.desc || `${Object.keys(project.environments).length} 个后端环境`}</CardDescription>
          </div><Badge variant="secondary" className={cn(state === "running" && "bg-success/10 text-success")}>{projectStateLabels[state]}</Badge></div>
        </CardHeader>
        <CardContent><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">代理入口</dt><dd className="mt-1 select-text break-all font-mono text-xs">{projectEntryUrl(project)}</dd></div><div><dt className="text-muted-foreground">{project.enabled ? "当前环境" : "已选环境"}</dt><dd className="mt-1 flex min-w-0 items-center gap-2"><Badge variant="outline">{environment ? project.current : "待添加环境"}</Badge>{environment && <span className="truncate text-xs text-muted-foreground" title={environment.addr}>{environment.addr}</span>}</dd></div></dl></CardContent>
        <CardFooter className="mt-auto flex flex-wrap justify-between gap-2 border-t"><Button variant="ghost" size="sm" onClick={() => onViewRequests(project.name)}><ScrollText />查看请求</Button><Button variant="outline" size="sm" onClick={() => onOpenProject(project.name)}>配置项目<ArrowRight /></Button></CardFooter>
      </Card>
    })}
  </section>
}
