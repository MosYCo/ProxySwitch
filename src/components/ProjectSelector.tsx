import { Plus, Box } from "lucide-react"
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
  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <Select value={selected || ""} onValueChange={onSelect}>
        <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-[280px]" aria-label="选择项目">
          <div className="flex min-w-0 items-center gap-2">
            <Box className="size-4 flex-shrink-0 text-primary" />
            <SelectValue placeholder="选择项目" className="truncate" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {projects.map((project) => (
              <SelectItem key={project.name} value={project.name} description={`${project.listen} / ${Object.keys(project.environments || {}).length} 个环境`}>
                {project.desc || project.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {onAdd && (
        <Button
          variant="outline"
          size="icon"
          className="size-9 flex-shrink-0"
          onClick={onAdd}
          aria-label="添加项目"
        >
          <Plus data-icon="inline-start" />
        </Button>
      )}
    </div>
  )
}
