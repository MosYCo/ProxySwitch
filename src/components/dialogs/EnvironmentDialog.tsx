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
import type { Environment } from "@/api"

interface EnvironmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  envName?: string | null
  environment?: Environment | null
  onSave: (name: string, env: Environment) => void
  onDelete?: (name: string) => void
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

  const handleSubmit = (e: React.FormEvent) => {
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

    onSave(name.trim(), {
      addr: formattedAddr,
      desc: desc.trim(),
    })
    onOpenChange(false)
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
              disabled={isEditing}
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
            />
            <p className="text-[10px] text-muted-foreground">
              可选，用于在界面上显示的环境说明
            </p>
          </div>

          <DialogFooter className="gap-2 pt-4">
            {isEditing && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete(name)
                  onOpenChange(false)
                }}
                className="mr-auto"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                删除环境
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
