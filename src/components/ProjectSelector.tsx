import { Plus } from "lucide-react"
import { EntityIcon } from "@/components/EntityIcon"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Project } from "@/api"

interface ProjectSelectorProps {
  projects: Project[]
  selected: string | null
  onSelect: (name: string) => void
  onAdd?: () => void
}

export function ProjectSelector({
  projects,
  selected,
  onSelect,
  onAdd,
}: ProjectSelectorProps) {
  const selectedProject = projects.find(project => project.name === selected)
  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <Select value={selected || ""} onValueChange={onSelect}>
        <SelectTrigger className="min-w-0 flex-1 sm:w-[280px]" aria-label="选择项目">
          <div className="flex min-w-0 items-center gap-2">
            <EntityIcon value={selectedProject?.icon} className="size-4 text-primary" />
            <SelectValue placeholder="选择项目">{selectedProject?.desc || selected || undefined}</SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {projects.map((project) => (
              <SelectItem key={project.name} value={project.name}>
                <span className="flex flex-col gap-0.5"><span>{project.desc || project.name}</span><span className="text-xs text-muted-foreground">{project.listen} / {Object.keys(project.environments || {}).length} 个环境</span></span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {onAdd && (
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={onAdd}
          aria-label="添加项目"
        >
          <Plus data-icon="inline-start" />
        </Button>
      )}
    </div>
  )
}
