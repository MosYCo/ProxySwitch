import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { Project } from "@/api"

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  onSave: (project: Omit<Project, "current"> & { current?: string }) => void
  onDelete?: () => void
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
  onDelete,
}: ProjectDialogProps) {
  const [name, setName] = useState("")
  const [listen, setListen] = useState("")
  const [desc, setDesc] = useState("")
  const [error, setError] = useState("")

  const isEditing = !!project

  useEffect(() => {
    if (project) {
      setName(project.name)
      setListen(project.listen)
      setDesc(project.desc || "")
    } else {
      setName("")
      setListen("")
      setDesc("")
    }
    setError("")
  }, [project, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("请输入项目名称")
      return
    }
    if (!listen.trim()) {
      setError("请输入监听端口")
      return
    }

    // 格式化端口
    let formattedListen = listen.trim()
    if (!formattedListen.startsWith(":")) {
      formattedListen = ":" + formattedListen
    }

    onSave({
      name: name.trim(),
      listen: formattedListen,
      desc: desc.trim(),
      environments: project?.environments || {},
      current: project?.current || "",
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEditing ? "编辑项目" : "添加项目"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditing ? "修改项目配置信息" : "创建新的前端项目代理配置"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm p-2 bg-destructive/10 rounded-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-mono">
              项目名称
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: frontend-a"
              className="font-mono text-sm"
              disabled={isEditing}
            />
            <p className="text-[10px] text-muted-foreground">
              用于标识项目的唯一名称，创建后不可修改
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="listen" className="text-sm font-mono">
              监听端口
            </Label>
            <Input
              id="listen"
              value={listen}
              onChange={(e) => setListen(e.target.value)}
              placeholder="例如: :3000 或 3000"
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Caddy 监听的端口号，会自动添加 : 前缀
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc" className="text-sm font-mono">
              项目描述
            </Label>
            <Input
              id="desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="例如: 前端项目 A"
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              可选，用于在界面上显示的项目说明
            </p>
          </div>

          {isEditing && project && (
            <div className="space-y-2">
              <Label className="text-sm font-mono">当前环境</Label>
              <div className="flex items-center gap-2">
                <Badge variant="info" className="font-mono">
                  {project.current || "未设置"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {Object.keys(project.environments || {}).length} 个环境
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-4">
            {isEditing && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete()
                  onOpenChange(false)
                }}
                className="mr-auto"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                删除项目
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">
              {isEditing ? (
                <>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  保存修改
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  创建项目
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
