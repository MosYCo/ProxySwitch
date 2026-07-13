import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, AlertCircle, Loader2 } from "lucide-react"
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
import type { Environment } from "@/api"

interface EnvironmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  envName?: string | null
  environment?: Environment | null
  onSave: (name: string, env: Environment) => Promise<boolean> | boolean
  onDelete?: (name: string) => Promise<boolean> | boolean
}

export function EnvironmentDialog({
  open,
  onOpenChange,
  envName,
  environment,
  onSave,
  onDelete,
}: EnvironmentDialogProps) {
  const [name, setName] = useState("")
  const [addr, setAddr] = useState("")
  const [desc, setDesc] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isEditing = !!envName

  useEffect(() => {
    if (envName && environment) {
      setName(envName)
      setAddr(environment.addr)
      setDesc(environment.desc || "")
    } else {
      setName("")
      setAddr("")
      setDesc("")
    }
    setError("")
  }, [envName, environment, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("请输入环境名称")
      return
    }
    if (!addr.trim()) {
      setError("请输入后端地址")
      return
    }

    // 格式化地址
    let formattedAddr = addr.trim()

    // 如果没有协议，添加 http://
    if (!formattedAddr.startsWith("http://") && !formattedAddr.startsWith("https://")) {
      formattedAddr = "http://" + formattedAddr
    }

    // 验证 URL 格式
    try {
      const url = new URL(formattedAddr)
      if (!url.hostname) {
        setError("地址格式不正确")
        return
      }
    } catch {
      setError("地址格式不正确，示例: http://example.com 或 https://10.0.1.10:8080")
      return
    }

    try {
      setSaving(true)
      const saved = await onSave(name.trim(), {
        addr: formattedAddr,
        desc: desc.trim(),
      })
      if (saved) {
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !name) return

    try {
      setDeleting(true)
      const deleted = await onDelete(name)
      if (deleted) {
        onOpenChange(false)
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEditing ? "编辑环境" : "添加环境"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditing ? "修改环境配置信息" : "为项目添加新的后端环境"}
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
            <Label htmlFor="env-name" className="text-sm font-mono">
              环境名称
            </Label>
            <Input
              id="env-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: dev1, test, prod"
              className="font-mono text-sm"
              disabled={isEditing || saving || deleting}
            />
            <p className="text-[10px] text-muted-foreground">
              用于标识环境的唯一名称，创建后不可修改
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr" className="text-sm font-mono">
              后端地址
            </Label>
            <Input
              id="addr"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="例如: http://api.example.com 或 https://10.0.1.10:8080"
              className="font-mono text-sm"
              disabled={saving || deleting}
            />
            <p className="text-[10px] text-muted-foreground">
              支持 HTTP/HTTPS 协议，如 http://example.com、https://10.0.1.10:8080
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="env-desc" className="text-sm font-mono">
              环境描述
            </Label>
            <Input
              id="env-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="例如: 开发环境 1"
              className="text-sm"
              disabled={saving || deleting}
            />
            <p className="text-[10px] text-muted-foreground">
              可选，用于在界面上显示的环境说明
            </p>
          </div>

          <DialogFooter className="gap-2 pt-4">
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
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    删除环境
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除环境</AlertDialogTitle>
                    <AlertDialogDescription>
                      将删除环境「{name}」。此操作不可撤销。
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
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  保存中
                </>
              ) : isEditing ? (
                <>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  保存修改
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  添加环境
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
