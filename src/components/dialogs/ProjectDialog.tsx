import { inputBehavior } from "@/lib/inputBehavior"
import { Label } from "@/components/ui/label"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import type { Project, ProxyOptions } from "@/api"
import { HealthEditor, ProxyEditor, type HealthEditorHandle, type ProxyEditorHandle } from "@/components/settings/ProxyEditor"
import { SettingField } from "@/components/settings/SettingsFields"
import { IconPicker } from "@/components/IconPicker"
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
import { DetailsSection } from "@/components/DetailsSection"
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
import { Checkbox } from "@/components/ui/checkbox"
import { hasProxyRoute, projectEntryUrl } from "@/lib/projectRouting"

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  projects: Project[]
  proxyDefaults?: ProxyOptions
  onSave: (
    project: Omit<Project, "current"> & { current?: string }
  ) => Promise<boolean> | boolean
  onDelete?: () => Promise<boolean> | boolean
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  projects,
  proxyDefaults,
  onSave,
  onDelete,
}: ProjectDialogProps) {
  const [name, setName] = useState("")
  const [listen, setListen] = useState("")
  const [desc, setDesc] = useState("")
  const [icon, setIcon] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [pathPrefix, setPathPrefix] = useState(false)
  const [stripPrefix, setStripPrefix] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [routePrefix, setRoutePrefix] = useState("")
  const [rewritePrefix, setRewritePrefix] = useState("")
  const proxyEditor = useRef<ProxyEditorHandle>(null)
  const healthEditor = useRef<HealthEditorHandle>(null)
  const errorBox = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) errorBox.current?.scrollIntoView({ block: "nearest" }) }, [error])

  const isEditing = !!project
  const nameInvalid = error.includes("项目名称")
  const listenInvalid = error.includes("监听端口")

  useEffect(() => {
    if (project) {
      setName(project.name)
      setListen(project.listen)
      setDesc(project.desc || "")
      setEnabled(project.enabled)
      setPathPrefix(project.path_prefix ?? false)
      setStripPrefix(project.strip_prefix ?? false)
    } else {
      setName("")
      setListen("")
      setDesc("")
      setEnabled(true)
      setPathPrefix(false)
      setStripPrefix(true)
    }
    setError("")
    setIcon(project?.icon ?? null)
    setRoutePrefix(project?.route_prefix || "")
    setRewritePrefix(project?.rewrite_prefix || "")
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
    if (/[/\s?#]/.test(name.trim()) || (pathPrefix && /[*{}]/.test(name.trim()))) {
      setError("项目名称不能包含空白、/、?、#，启用前缀时也不能包含 *、{、}")
      return
    }
    if (!isEditing && projects.some((p) => p.name === name.trim())) {
      setError("项目名称已存在，请使用其他名称")
      return
    }
    const port = Number(listen.trim().replace(/^:/, ""))
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError("监听端口必须是 1–65535 的整数")
      return
    }
    const shared = projects.filter((p) => p.name !== project?.name && hasProxyRoute(p) && Number(p.listen.replace(/^:/, "")) === port)
    if (project && hasProxyRoute(project) && shared.length && (!(pathPrefix || routePrefix.trim()) || shared.some((p) => !p.path_prefix && !p.route_prefix))) {
      setError("监听端口已被使用，请先为该端口所有启用项目设置路径前缀，或选择其他端口")
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
        icon,
        enabled,
        path_prefix: pathPrefix,
        strip_prefix: pathPrefix && stripPrefix,
        route_prefix: routePrefix.trim() || null,
        rewrite_prefix: rewritePrefix.trim() || null,
        proxy: proxyEditor.current?.read() || {},
        health: healthEditor.current?.read() || {},
        environments: project?.environments || {},
        current: project?.current || "",
      })
      if (saved) onOpenChange(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑项目" : "添加项目"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "修改项目的监听端口和显示信息" : "创建一个新的代理入口"}
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
              <FieldLabel htmlFor="name">项目名称</FieldLabel>
              <Input {...inputBehavior}
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
              <Input {...inputBehavior}
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
              <Input {...inputBehavior}
                id="desc"
                value={desc}
                onChange={(event) => setDesc(event.target.value)}
                placeholder="前端项目 A"
                disabled={saving || deleting}
              />
              <FieldDescription>可选，用于在界面上显示。</FieldDescription>
            </Field>

            <IconPicker label="项目图标" value={icon} onChange={setIcon} disabled={saving || deleting} />

            {!isEditing && <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>创建后启用项目</FieldTitle>
                <FieldDescription>关闭后仅保存配置，可在项目配置中单独启用。启停状态会在重启后保留。</FieldDescription>
              </FieldContent>
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving || deleting} aria-label="创建后启用项目" />
            </Field>}

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>使用项目路径前缀</FieldTitle>
                <FieldDescription>共用端口时，所有启用项目都需设置此前缀。更改后访问路径也会改变。</FieldDescription>
                <code className="break-all text-xs text-primary">{projectEntryUrl({ name: name.trim() || "项目名", listen: formattedPort(listen), path_prefix: pathPrefix, route_prefix: routePrefix.trim() || null })}</code>
              </FieldContent>
              <Switch checked={pathPrefix} onCheckedChange={setPathPrefix} disabled={saving || deleting} aria-label="使用项目路径前缀" />
            </Field>
            {pathPrefix && <Label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Checkbox className="mt-0.5" checked={stripPrefix} onCheckedChange={(checked) => setStripPrefix(checked === true)} disabled={saving || deleting} />
              转发时移除项目路径前缀（旧配置默认保留前缀）
            </Label>}

            <DetailsSection title="高级代理规则" disabled={saving || deleting}><fieldset disabled={saving || deleting} className="space-y-5">
              <p className="text-xs leading-5 text-muted-foreground">留空的参数继承全局默认，环境可以继续覆盖。</p>
              <SettingField label="自定义匹配前缀" description="例如 /api/order，覆盖项目名称前缀。共用端口时，匹配前缀须不同。"><Input {...inputBehavior} aria-label="自定义匹配前缀" value={routePrefix} onChange={(event) => setRoutePrefix(event.target.value)} placeholder={pathPrefix ? `/${name || "项目名"}` : "留空匹配整个端口"} /></SettingField>
              <SettingField label="替换为转发前缀" description="填写后替换匹配前缀，再拼接到后端基础路径。填 / 表示移除匹配前缀。"><Input {...inputBehavior} aria-label="替换为转发前缀" value={rewritePrefix} onChange={(event) => setRewritePrefix(event.target.value)} placeholder="例如 /v1，留空沿用现有转发方式" /></SettingField>
              <ProxyEditor ref={proxyEditor} initialValue={project?.proxy} inherited={proxyDefaults} />
            </fieldset></DetailsSection>
            <DetailsSection title="项目健康检查" disabled={saving || deleting}><fieldset disabled={saving || deleting}><HealthEditor ref={healthEditor} initialValue={project?.health} /></fieldset></DetailsSection>

            {isEditing && project && (
              <Field orientation="horizontal">
                <FieldTitle>当前环境</FieldTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
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

function formattedPort(listen: string) { return listen.trim().startsWith(":") ? listen.trim() : `:${listen.trim() || "8080"}` }
