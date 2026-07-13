import { RefreshCw, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProjectSelector } from "@/components/ProjectSelector"
import type { Project } from "@/api"

interface ProjectToolbarProps {
  projects: Project[]
  selectedProject: string | null
  currentProject?: Project
  onSelectProject: (name: string) => void
  onAddProject: () => void
  onEditProject: () => void
  onAddEnv: () => void
  onRestartProxy: () => void
  restartingProxy?: boolean
}

export function ProjectToolbar({
  projects,
  selectedProject,
  currentProject,
  onSelectProject,
  onAddProject,
  onEditProject,
  onAddEnv,
  onRestartProxy,
  restartingProxy = false,
}: ProjectToolbarProps) {
  return (
    <>
      {/* 项目选择器 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ProjectSelector
          projects={projects}
          selected={selectedProject}
          onSelect={onSelectProject}
          onAdd={onAddProject}
        />
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {currentProject && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-mono"
              onClick={onEditProject}
            >
              <Pencil className="mr-1.5 h-3 w-3" />
              编辑项目
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-mono"
            onClick={onRestartProxy}
            disabled={restartingProxy}
          >
            <RefreshCw className={restartingProxy ? "mr-1.5 h-3 w-3 animate-spin" : "mr-1.5 h-3 w-3"} />
            {restartingProxy ? "重启中" : "重启代理"}
          </Button>
        </div>
      </div>

      {/* 环境标题 */}
      {currentProject && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-display font-semibold tracking-wide">
              {currentProject.desc || currentProject.name}
            </h2>
            <Badge variant="outline" className="flex-shrink-0 text-[10px] font-mono">
              {currentProject.listen}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-mono"
            onClick={onAddEnv}
          >
            <Plus className="mr-1 h-3 w-3" />
            添加环境
          </Button>
        </div>
      )}
    </>
  )
}
