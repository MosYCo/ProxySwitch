import { inputBehavior } from "@/lib/inputBehavior"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { AlertCircle, Archive, HeartPulse, Loader2, Play, Save, ScrollText, Settings2, SlidersHorizontal } from "lucide-react"
import { settingsApi, type AppSettings, type Project, type SettingsView } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DataSettings } from "@/components/settings/DataSettings"
import { ProxyEditor, type ProxyEditorHandle } from "@/components/settings/ProxyEditor"
import { SettingField, SettingNumber, SettingSelect, SettingSwitch } from "@/components/settings/SettingsFields"
import { useToastContext } from "@/contexts/ToastContext"
import { parseStatusCodes } from "@/lib/settings"

const tabs = [
  { id: "startup", title: "启动与退出", icon: Play, hint: "决定软件如何启动，以及关闭窗口后的行为。" },
  { id: "logs", title: "请求与日志", icon: ScrollText, hint: "保留有用的请求信息，控制记录数量与保存期限。" },
  { id: "health", title: "健康检查", icon: HeartPulse, hint: "设置后端检查的默认规则，项目和环境可以单独覆盖。" },
  { id: "proxy", title: "代理默认值", icon: SlidersHorizontal, hint: "项目和环境未单独设置时使用这里的值。" },
  { id: "caddy", title: "Caddy 引擎", icon: Settings2, hint: "连接管理接口，并设置意外退出时的恢复策略。" },
  { id: "data", title: "数据与备份", icon: Archive, hint: "迁移项目配置，保留和恢复配置快照。" },
] as const

export function SettingsDialog({ open, onOpenChange, projects, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; projects: Project[]; onSaved: () => void }) {
  const [view, setView] = useState<SettingsView | null>(null)
  const [savedView, setSavedView] = useState<SettingsView | null>(null)
  const [tab, setTab] = useState<string>("startup")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState("")
  const [ignored, setIgnored] = useState("")
  const [redacted, setRedacted] = useState("")
  const [proxyDirty, setProxyDirty] = useState(false)
  const [dataBusy, setDataBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const proxy = useRef<ProxyEditorHandle>(null)
  const errorBox = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) errorBox.current?.scrollIntoView({ block: "nearest" }) }, [error])
  const { toast } = useToastContext()
  const dirty = !!view && !!savedView && (proxyDirty || JSON.stringify(view) !== JSON.stringify(savedView) || statuses !== savedView.settings.health.expected_statuses.join(", ") || ignored !== savedView.settings.logs.ignored_paths.join("\n") || redacted !== savedView.settings.logs.redacted_query_params.join(", "))
  const close = () => { if (saving || dataBusy) return; if (dirty) setDiscardOpen(true); else onOpenChange(false) }
  const load = async () => {
    setLoading(true); setError(null)
    try {
      const next = await settingsApi.get(); setView(next); setSavedView(next)
      setStatuses(next.settings.health.expected_statuses.join(", ")); setIgnored(next.settings.logs.ignored_paths.join("\n")); setRedacted(next.settings.logs.redacted_query_params.join(", ")); setProxyDirty(false)
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); setView(null) } finally { setLoading(false) }
  }
  useEffect(() => { if (open) void load() }, [open])
  const update = <K extends keyof AppSettings>(section: K, value: AppSettings[K]) => setView((current) => current ? { ...current, settings: { ...current.settings, [section]: value } } : null)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!view) return
    setSaving(true); setError(null)
    try {
      let codes: number[]
      try { codes = parseStatusCodes(statuses) } catch (error) { setTab("health"); throw error }
      let options
      try { options = proxy.current?.read() || view.settings.proxy } catch (error) { setTab("proxy"); throw error }
      const settings = { ...view.settings, proxy: options, health: { ...view.settings.health, expected_statuses: codes }, logs: { ...view.settings.logs, ignored_paths: ignored.split("\n").map((v) => v.trim()).filter(Boolean), redacted_query_params: redacted.split(/[,，\s]+/).filter(Boolean) } }
      const applied = await settingsApi.update(view.admin, settings)
      onSaved(); await load()
      toast({ title: "设置已保存", description: applied ? "代理参数已应用；启动相关设置将在下次启动时使用" : "代理参数将在下次启动 Caddy 时生效", variant: "success" })
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }
  }
  const active = tabs.find((item) => item.id === tab)!
  const settings = view?.settings
  return <><Dialog open={open} onOpenChange={(value) => { if (!value) close() }}><DialogContent className="flex h-[min(760px,90dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[880px]">
    <DialogHeader className="shrink-0 border-b px-6 py-5"><DialogTitle>设置</DialogTitle><DialogDescription>管理应用偏好、代理默认规则和项目数据。</DialogDescription></DialogHeader>
    <form className="flex min-h-0 flex-1 flex-col" autoComplete="off" noValidate onSubmit={submit}>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3"><TabsList className="grid w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-auto min-[360px]:grid-cols-3 md:grid-cols-6" aria-label="设置分类">{tabs.map(({ id, title, icon: Icon }) => <TabsTrigger key={id} value={id} disabled={dataBusy || saving} className="h-9 min-w-0 px-1 text-xs sm:px-2 sm:text-sm"><Icon />{title}</TabsTrigger>)}</TabsList></div>
        <ScrollArea type="auto" className="min-h-0 min-w-0 flex-1 overflow-hidden"><div className="p-6"><div className="mb-6"><h2 className="text-base font-semibold">{active.title}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{active.hint}</p></div>
          {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在读取设置…</div> : !view || !settings ? <Button type="button" variant="outline" onClick={() => void load()}>重试加载</Button> : <fieldset disabled={saving} className="min-w-0 space-y-5">
            <TabsContent value="startup" forceMount hidden={tab !== "startup"} className="space-y-6">
              <SettingSwitch label="开机自启" description={view.autostart_supported ? "登录 Windows 后启动本应用。" : "当前系统暂不支持此选项。"} value={settings.startup.launch_at_login} onChange={(value) => update("startup", { ...settings.startup, launch_at_login: value })} disabled={!view.autostart_supported} />
              <SettingSwitch label="启动应用时启动 Caddy" description="关闭后可编辑和管理配置，需要代理时手动启动引擎。" value={settings.startup.start_caddy} onChange={(value) => update("startup", { ...settings.startup, start_caddy: value })} />
              <SettingSwitch label="启动后隐藏到托盘" description="从托盘图标打开主窗口。" value={settings.startup.start_hidden} onChange={(value) => update("startup", { ...settings.startup, start_hidden: value })} />
              <SettingField label="关闭主窗口时"><SettingSelect label="关闭主窗口时" value={settings.startup.close_action} onValueChange={(next) => update("startup", { ...settings.startup, close_action: next as "tray" | "quit" })} options={[{ value: "tray", label: "隐藏到托盘", description: "关闭窗口后代理继续运行" }, { value: "quit", label: "退出应用", description: "同时停止由本应用托管的 Caddy" }]} /></SettingField>
            </TabsContent>
            <TabsContent value="logs" forceMount hidden={tab !== "logs"} className="space-y-5">
              <SettingSwitch label="记录代理请求" description="关闭后不再采集新的访问记录，软件事件和引擎错误继续记录。" value={settings.logs.requests_enabled} onChange={(value) => update("logs", { ...settings.logs, requests_enabled: value })} />
              <div className="grid gap-4 sm:grid-cols-2"><SettingNumber label="每个来源的缓存条数" min={100} max={10000} value={settings.logs.entries_per_source} onChange={(v) => update("logs", { ...settings.logs, entries_per_source: v ?? 0 })} /><SettingNumber label="磁盘日志保留天数" min={0} max={365} value={settings.logs.retention_days} onChange={(v) => update("logs", { ...settings.logs, retention_days: v ?? 0 })} /></div>
              <p className="text-xs leading-5 text-muted-foreground">保留天数为 0 时不自动清理；设置正数后会清理到期的按日保存日志。</p>
              <SettingNumber label="慢请求阈值（毫秒）" min={1} max={3600000} value={settings.logs.slow_request_ms} onChange={(v) => update("logs", { ...settings.logs, slow_request_ms: v ?? 0 })} />
              <SettingField label="忽略的请求路径" description="每行一条。/health 只匹配该路径，/assets/* 匹配此前缀及子路径。"><Textarea {...inputBehavior} aria-label="忽略的请求路径" className="font-mono text-xs" value={ignored} onChange={(event) => setIgnored(event.target.value)} placeholder={"/health\n/assets/*"} /></SettingField>
              <SettingField label="脱敏的查询参数" description="以逗号分隔。调整规则会清空当前 Caddy 缓存；新记录在展示、复制与落盘前脱敏，已有磁盘文件保持原样。"><Input {...inputBehavior} aria-label="脱敏的查询参数" value={redacted} onChange={(event) => setRedacted(event.target.value)} placeholder="token, password, api_key" /></SettingField>
            </TabsContent>
            <TabsContent value="health" forceMount hidden={tab !== "health"} className="space-y-5">
              <SettingSwitch label="启用健康检查" description="关闭后停止所有后台检查，项目请求转发继续运行。" value={settings.health.enabled} onChange={(value) => update("health", { ...settings.health, enabled: value })} />
              <SettingField label="检查范围"><SettingSelect label="健康检查范围" value={settings.health.only_current ? "current" : "all"} onValueChange={(next) => update("health", { ...settings.health, only_current: next === "current" })} options={[{ value: "current", label: "仅检查当前环境", description: "检查启用项目当前使用的环境" }, { value: "all", label: "检查所有环境", description: "检查启用项目中的每个环境" }]} /></SettingField>
              <div className="grid gap-4 sm:grid-cols-2"><SettingNumber label="检查间隔（秒）" min={5} max={3600} value={settings.health.interval_secs} onChange={(v) => update("health", { ...settings.health, interval_secs: v ?? 0 })} /><SettingNumber label="检查超时（毫秒）" min={100} max={60000} value={settings.health.timeout_ms} onChange={(v) => update("health", { ...settings.health, timeout_ms: v ?? 0 })} /></div>
              <SettingField label="默认检查路径" description="拼接到后端地址的基础路径后。"><Input {...inputBehavior} aria-label="默认检查路径" value={settings.health.path} onChange={(event) => update("health", { ...settings.health, path: event.target.value })} placeholder="/health" /></SettingField>
              <SettingField label="预期状态码" description="留空接受 200–399；填写时只接受列出的状态码。"><Input {...inputBehavior} aria-label="预期状态码" value={statuses} onChange={(event) => setStatuses(event.target.value)} placeholder="200, 204" /></SettingField>
              <SettingSwitch label="检查失败时尝试根路径" description="指定路径返回 404、405 或连接失败时回退到 /；总耗时仍受检查超时限制。" value={settings.health.fallback_to_root} onChange={(value) => update("health", { ...settings.health, fallback_to_root: value })} />
            </TabsContent>
            <TabsContent value="proxy" forceMount hidden={tab !== "proxy"}><ProxyEditor ref={proxy} initialValue={savedView?.settings.proxy} onEdited={() => setProxyDirty(true)} /></TabsContent>
            <TabsContent value="caddy" forceMount hidden={tab !== "caddy"} className="space-y-5">
              <SettingField label="管理地址" description="正在运行时立即切换，停止时保存供下次启动使用。"><Input {...inputBehavior} aria-label="Caddy 管理地址" value={view.admin} onChange={(event) => setView({ ...view, admin: event.target.value })} placeholder="localhost:2019" className="font-mono" /></SettingField>
              <SettingField label="引擎日志级别" description="控制 Caddy 运行日志的详细程度，请求记录独立采集。"><SettingSelect label="Caddy 日志级别" value={settings.logs.caddy_level} onValueChange={(next) => update("logs", { ...settings.logs, caddy_level: next as AppSettings["logs"]["caddy_level"] })} options={[{ value: "DEBUG", label: "DEBUG · 调试", description: "详细输出，适合排查问题" }, { value: "INFO", label: "INFO · 信息", description: "常规运行信息、警告与错误" }, { value: "WARN", label: "WARN · 警告", description: "仅记录警告与错误" }, { value: "ERROR", label: "ERROR · 错误", description: "仅记录错误" }]} /></SettingField>
              <SettingSwitch label="意外退出后自动重启" description="只恢复本应用托管的进程；手动停止后保持停止。稳定运行一分钟后重置恢复次数。" value={settings.caddy.auto_restart} onChange={(value) => update("caddy", { ...settings.caddy, auto_restart: value })} />
              <SettingNumber label="最多自动重试次数" min={1} max={10} value={settings.caddy.restart_attempts} onChange={(v) => update("caddy", { ...settings.caddy, restart_attempts: v ?? 0 })} />
            </TabsContent>
            <TabsContent value="data" forceMount hidden={tab !== "data"}><DataSettings settings={settings.backup} onChange={(value) => update("backup", value)} projects={projects} backupDir={view.backup_dir} dirty={dirty} onApplied={() => { onSaved(); void load() }} onBusyChange={setDataBusy} /></TabsContent>
          </fieldset>}
          {error && <Alert ref={errorBox} className="mt-5" variant="destructive"><AlertCircle className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </div></ScrollArea>
      </Tabs>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-card px-6 py-4"><span className="text-xs text-muted-foreground" role="status">{view && (dirty ? "有未保存的修改" : "设置已与本机同步")}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={saving || dataBusy} onClick={close}>关闭</Button><Button type="submit" disabled={!view || loading || saving || dataBusy || !dirty}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存设置</Button></div></div>
    </form>
  </DialogContent></Dialog><AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>当前修改尚未生效，可返回继续编辑或放弃修改并关闭设置。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={() => onOpenChange(false)}>放弃修改</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>
}
