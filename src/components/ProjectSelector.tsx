import { Plus, Box } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
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
    <div className="flex items-center gap-2">
      <Select value={selected || ""} onValueChange={onSelect}>
        <SelectTrigger className="w-[280px] h-9 bg-card border-border/50 font-mono text-sm">
          <div className="flex items-center gap-2">
            <Box className="h-3.5 w-3.5 text-primary" />
            <SelectValue placeholder="选择项目" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {projects.map((project) => (
            <SelectItem
              key={project.name}
              value={project.name}
              className="focus:bg-primary/10 focus:text-primary"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-display font-semibold text-sm">
                  {project.desc || project.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {project.listen} • {Object.keys(project.environments || {}).length} 个环境
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onAdd && (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 border-border/50 hover:border-primary/50 hover:bg-primary/5"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
