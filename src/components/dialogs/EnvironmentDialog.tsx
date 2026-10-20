import { useEffect, useRef, useState, type FormEvent } from "react"
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import type { Environment, ProxyOptions } from "@/api"
import { HealthEditor, ProxyEditor, type HealthEditorHandle, type ProxyEditorHandle } from "@/components/settings/ProxyEditor"
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
import { Button } from "@/components/ui/button"
import { Disclosure } from "@/components/ui/disclosure"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

interface EnvironmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  envName?: string | null
  environment?: Environment | null
  isCurrent?: boolean
  proxyDefaults?: ProxyOptions
  onSave: (name: string, env: Environment) => Promise<boolean> | boolean
  onDelete?: (name: string) => Promise<boolean> | boolean
}

export function EnvironmentDialog({
  open,
  onOpenChange,
  envName,
  environment,
  isCurrent = false,
  proxyDefaults,
  onSave,
  onDelete,
}: EnvironmentDialogProps) {
  const [name, setName] = useState("")
  const [addr, setAddr] = useState("")
  const [desc, setDesc] = useState("")
  const [insecureSkipVerify, setInsecureSkipVerify] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const proxyEditor = useRef<ProxyEditorHandle>(null)
  const healthEditor = useRef<HealthEditorHandle>(null)
  const errorBox = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) errorBox.current?.scrollIntoView({ block: "nearest" }) }, [error])

  const isEditing = !!envName
  const nameInvalid = error.includes("环境名称")
  const addrInvalid = error.includes("地址")

  useEffect(() => {
    if (envName && environment) {
      setName(envName)
      setAddr(environment.addr)
      setDesc(environment.desc || "")
      setInsecureSkipVerify(environment.insecure_skip_verify ?? true)
    } else {
      setName("")
      setAddr("")
      setDesc("")
      setInsecureSkipVerify(true)
    }
    setError("")
  }, [envName, environment, open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("请输入环境名称")
      return
    }
    if (!addr.trim()) {
      setError("请输入后端地址")
      return
    }

    let formattedAddr = addr.trim()
    if (!formattedAddr.startsWith("http://") && !formattedAddr.startsWith("https://")) {
      formattedAddr = `http://${formattedAddr}`
    }

    try {
      const url = new URL(formattedAddr)
      if (!url.hostname || !["http:", "https:"].includes(url.protocol)) {
        setError("地址格式不正确")
        return
      }
      if (url.search || url.hash || url.username || url.password) {
        setError("后端地址支持路径，但不能包含用户名、密码、查询参数或片段")
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
        insecure_skip_verify: insecureSkipVerify,
        proxy: proxyEditor.current?.read() || {},
        health: healthEditor.current?.read() || {},
      })
      if (saved) onOpenChange(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !name) return

    try {
      setDeleting(true)
      const deleted = await onDelete(name)
      if (deleted) onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑环境" : "添加环境"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "修改环境的后端地址和连接选项" : "为当前项目添加一个后端环境"}
          </DialogDescription>
        </DialogHeader>

        <form autoComplete="off" noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <Alert ref={errorBox} variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            <Field data-invalid={nameInvalid || undefined}>
              <FieldLabel htmlFor="env-name">环境名称</FieldLabel>
              <Input
                id="env-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="dev, test, prod"
                className="font-mono"
                disabled={isEditing || saving || deleting}
                aria-invalid={nameInvalid}
              />
              <FieldDescription>创建后不可修改，用来标识环境。</FieldDescription>
              {nameInvalid && <FieldError>{error}</FieldError>}
            </Field>

            <Field data-invalid={addrInvalid || undefined}>
              <FieldLabel htmlFor="addr">后端地址</FieldLabel>
              <Input
                id="addr"
                value={addr}
                onChange={(event) => setAddr(event.target.value)}
                placeholder="http://api.example.com 或 https://10.0.1.10:8080"
                className="font-mono"
                disabled={saving || deleting}
                aria-invalid={addrInvalid}
              />
              <FieldDescription>
                支持 HTTP/HTTPS；未填写协议时会默认补为 HTTP。
              </FieldDescription>
              {addrInvalid && <FieldError>{error}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="env-desc">环境描述</FieldLabel>
              <Input
                id="env-desc"
                value={desc}
                onChange={(event) => setDesc(event.target.value)}
                placeholder="开发环境 1"
                disabled={saving || deleting}
              />
              <FieldDescription>可选，用于在环境卡片中显示。</FieldDescription>
            </Field>

            <Field orientation="horizontal" data-disabled={saving || deleting || undefined}>
              <FieldContent>
                <FieldTitle>跳过 HTTPS 证书校验</FieldTitle>
                <FieldDescription>
                  适用于自签名证书或内网证书，HTTP 后端会忽略此选项。
                </FieldDescription>
              </FieldContent>
              <Switch
                id="insecure-skip-verify"
                checked={insecureSkipVerify}
                onCheckedChange={setInsecureSkipVerify}
                disabled={saving || deleting}
                aria-label="跳过 HTTPS 证书校验"
              />
            </Field>
            <Disclosure title="环境代理参数" disabled={saving || deleting}><fieldset disabled={saving || deleting} className="space-y-4"><p className="text-xs leading-5 text-muted-foreground">留空继承项目和全局默认，填写后仅对此环境生效。</p><ProxyEditor ref={proxyEditor} initialValue={environment?.proxy} inherited={proxyDefaults} /></fieldset></Disclosure>
            <Disclosure title="环境健康检查" disabled={saving || deleting}><fieldset disabled={saving || deleting}><HealthEditor ref={healthEditor} initialValue={environment?.health} /></fieldset></Disclosure>
          </FieldGroup>

          <DialogFooter className="gap-2">
            {isEditing && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mr-auto"
                    disabled={saving || deleting || isCurrent}
                    title={isCurrent ? "请先切换到其他环境再删除" : undefined}
                  >
                    {deleting ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Trash2 data-icon="inline-start" />
                    )}
                    {isCurrent ? "当前环境不可删除" : "删除环境"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
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
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : isEditing ? (
                <Pencil data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {saving ? "保存中" : isEditing ? "保存修改" : "添加环境"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
