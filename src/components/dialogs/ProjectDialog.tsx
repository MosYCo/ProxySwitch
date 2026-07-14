import { useEffect, useState, type FormEvent } from "react"
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import type { Project } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  onSave: (
    project: Omit<Project, "current"> & { current?: string }
  ) => Promise<boolean> | boolean
  onDelete?: () => Promise<boolean> | boolean
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
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isEditing = !!project
  const nameInvalid = error.includes("项目名称")
  const listenInvalid = error.includes("监听端口")

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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("请输入项目名称")
      return
    }
    if (!listen.trim()) {
      setError("请输入监听端口")
      return
    }

    let formattedListen = listen.trim()
    if (!formattedListen.startsWith(":")) {
      formattedListen = `:${formattedListen}`
    }

    try {
      setSaving(true)
      const saved = await onSave({
        name: name.trim(),
        listen: formattedListen,
        desc: desc.trim(),
        environments: project?.environments || {},
        current: project?.current || "",
      })
      if (saved) onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return

    try {
      setDeleting(true)
      const deleted = await onDelete()
      if (deleted) onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑项目" : "添加项目"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "修改项目的监听端口和显示信息" : "创建一个新的代理入口"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            <Field data-invalid={nameInvalid || undefined}>
              <FieldLabel htmlFor="name">项目名称</FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="frontend-a"
                className="font-mono"
                disabled={isEditing || saving || deleting}
                aria-invalid={nameInvalid}
              />
              <FieldDescription>创建后不可修改，用来标识项目配置。</FieldDescription>
              {nameInvalid && <FieldError>{error}</FieldError>}
            </Field>

            <Field data-invalid={listenInvalid || undefined}>
              <FieldLabel htmlFor="listen">监听端口</FieldLabel>
              <Input
                id="listen"
                value={listen}
                onChange={(event) => setListen(event.target.value)}
                placeholder=":3000 或 3000"
                className="font-mono"
                disabled={saving || deleting}
                aria-invalid={listenInvalid}
              />
              <FieldDescription>Caddy 监听的端口号，会自动添加 : 前缀。</FieldDescription>
              {listenInvalid && <FieldError>{error}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="desc">项目描述</FieldLabel>
              <Input
                id="desc"
                value={desc}
                onChange={(event) => setDesc(event.target.value)}
                placeholder="前端项目 A"
                disabled={saving || deleting}
              />
              <FieldDescription>可选，用于在界面上显示。</FieldDescription>
            </Field>

            {isEditing && project && (
              <Field orientation="horizontal">
                <FieldTitle>当前环境</FieldTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="info" className="font-mono">
                    {project.current || "未设置"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {Object.keys(project.environments || {}).length} 个环境
                  </span>
                </div>
              </Field>
            )}
          </FieldGroup>

          <DialogFooter className="gap-2">
            {isEditing && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mr-auto"
                    disabled={saving || deleting}
                  >
                    {deleting ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Trash2 data-icon="inline-start" />
                    )}
                    删除项目
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除项目</AlertDialogTitle>
                    <AlertDialogDescription>
                      将删除项目「{project.name}」及其所有环境配置。此操作不可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving || deleting}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving || deleting}>
              {saving ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : isEditing ? (
                <Pencil data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {saving ? "保存中" : isEditing ? "保存修改" : "创建项目"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
