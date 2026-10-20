import { useEffect, useRef, useState } from "react"
import { Download, History, Loader2, Upload } from "lucide-react"
import { settingsApi, type AppSettings, type BackupInfo, type ImportPreview, type Project } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/CopyButton"
import { SettingNumber, SettingSelect, SettingSwitch } from "./SettingsFields"

export function DataSettings({ settings, onChange, projects, backupDir, dirty, onApplied, onBusyChange }: { settings: AppSettings["backup"]; onChange: (value: AppSettings["backup"]) => void; projects: Project[]; backupDir: string; dirty: boolean; onApplied: () => void; onBusyChange: (busy: boolean) => void }) {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [project, setProject] = useState("")
  const [imported, setImported] = useState<{ data: string; preview: ImportPreview; name: string } | null>(null)
  const [replaceAll, setReplaceAll] = useState(false)
  const [restore, setRestore] = useState<BackupInfo | null>(null)
  const [restoreSettings, setRestoreSettings] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const refresh = async () => setBackups(await settingsApi.backups())
  useEffect(() => { void refresh().catch((error) => setError(String(error))) }, [])
  const run = async (action: () => Promise<void>) => {
    setBusy(true); onBusyChange(true); setError(null); setNotice("")
    try { await action() } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="space-y-6">
    <SettingSwitch label="修改前自动备份" description="修改项目、环境或设置前保存一份配置快照。" value={settings.enabled} onChange={(enabled) => onChange({ ...settings, enabled })} />
    <SettingNumber label="最多保留备份数" min={1} max={100} value={settings.max_backups} onChange={(v) => onChange({ ...settings, max_backups: v ?? 0 })} />
    <div className="border-t pt-5"><h3 className="text-sm font-semibold">导入与导出</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">迁移项目、环境与高级规则。本机启动选项和 Caddy 管理地址保持当前设置。</p>
      <div className="mt-4 flex flex-wrap gap-2"><SettingSelect className="min-w-[160px] flex-1" label="导出项目范围" value={project ? `project:${project}` : "all"} onValueChange={(next) => setProject(next === "all" ? "" : next.slice(8))} disabled={busy} options={[{ value: "all", label: "全部项目" }, ...projects.map((item) => ({ value: `project:${item.name}`, label: item.name }))]} /><Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => setNotice(`已导出到下载目录：${await settingsApi.exportProjects(project || null)}`))}><Download className="size-4" />导出到下载目录</Button></div>
      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="选择配置文件" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return
        void run(async () => { if (file.size > 10 * 1024 * 1024) throw new Error("配置文件不能超过 10 MB"); const data = await file.text(); setImported({ data, preview: await settingsApi.previewImport(data), name: file.name }); setReplaceAll(false) })
      }} />
      <Button type="button" className="mt-3" variant="outline" disabled={busy || dirty} onClick={() => fileInput.current?.click()}><Upload className="size-4" />选择配置文件</Button>
      {imported && <div className="mt-4 space-y-3 rounded-xl border bg-muted/30 p-4"><p className="break-all text-sm font-medium">{imported.name}</p><p className="text-xs leading-6">共 {imported.preview.projects.length} 个项目：{imported.preview.projects.join("、") || "空配置"}。同名项目 {imported.preview.replaced.length} 个：{imported.preview.replaced.join("、") || "无"}。</p><SettingSelect label="导入方式" value={replaceAll ? "replace" : "merge"} onValueChange={(next) => setReplaceAll(next === "replace")} disabled={busy} options={[{ value: "merge", label: "合并导入", description: "保留其他项目，覆盖同名项目" }, { value: "replace", label: "替换全部项目", description: "使用文件内容替换现有全部项目" }]} /><p className="text-xs text-muted-foreground">{replaceAll ? "现有项目将被文件中的项目整体替换。" : "保留其他项目，同名项目及其环境将被覆盖。"}{settings.enabled ? "操作前会自动备份。" : "自动备份已关闭，可先手动创建备份。"}</p><Button type="button" disabled={busy || dirty} onClick={() => void run(async () => { await settingsApi.importProjects(imported.data, replaceAll); setImported(null); await refresh(); onApplied(); setNotice("项目配置已导入") })}>确认导入</Button></div>}
    </div>
    <div className="border-t pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">配置备份 <span className="text-xs font-normal text-muted-foreground">{backups.length} 份</span></h3><Button type="button" variant="outline" size="sm" disabled={busy || dirty} onClick={() => void run(async () => { await settingsApi.createBackup(); await refresh(); setNotice("当前配置已备份") })}><History className="size-3.5" />立即备份</Button></div>
      <div className="mt-2 flex items-start gap-1"><p className="min-w-0 break-all font-mono text-[11px] leading-5 text-muted-foreground">{backupDir}</p><CopyButton value={backupDir} label="复制备份目录" /></div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">恢复时可选择仅恢复项目，或同时恢复应用设置。{dirty && "请先保存或取消当前设置修改，再导入或恢复。"}</p>
      <div className="mt-3 max-h-52 overflow-auto rounded-xl border">{backups.length ? backups.map((item) => <div className="flex items-center gap-3 border-b px-3 py-2.5 last:border-0" key={item.id}><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs" title={item.id}>{item.id.replace(/^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2}).*/, "$1-$2-$3 $4:$5:$6 UTC")}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.projects} 个项目</p></div><Button type="button" variant="ghost" size="sm" disabled={busy || dirty} onClick={() => { setRestore(item); setRestoreSettings(false) }}>恢复</Button></div>) : <p className="p-4 text-xs text-muted-foreground">还没有备份，保存修改或点击「立即备份」后会出现在这里。</p>}</div>
    </div>
    {busy && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />正在处理…</p>}
    {notice && <p role="status" className="select-text break-all rounded-lg bg-success/10 p-3 text-xs leading-6 text-success">{notice}</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <AlertDialog open={!!restore} onOpenChange={(open) => { if (!open && !busy) setRestore(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>恢复配置？</AlertDialogTitle><AlertDialogDescription>将用此备份中的 {restore?.projects} 个项目替换当前全部项目及环境。{settings.enabled ? "当前配置会先自动备份。" : "当前未启用自动备份。"}</AlertDialogDescription></AlertDialogHeader><SettingSwitch label="同时恢复应用设置" description="包括代理默认值、健康检查、管理地址、开机自启等；关闭时仅恢复项目。" value={restoreSettings} onChange={setRestoreSettings} disabled={busy} /><AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction disabled={busy || dirty} onClick={(event) => { event.preventDefault(); if (restore) void run(async () => { await settingsApi.restoreBackup(restore.id, restoreSettings); setRestore(null); await refresh(); onApplied(); setNotice("配置已恢复") }) }}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}恢复配置</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
