import { useState } from "react"
import { AlertCircle, CheckCircle2, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingSwitch } from "@/components/settings/SettingsFields"
import type { AppUpdater } from "@/hooks/useAppUpdater"
import { version } from "../../../package.json"

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function UpdateDialog({ updater, editing }: { updater: AppUpdater; editing: boolean }) {
  const { status, phase, release, progress, error } = updater
  const [confirm, setConfirm] = useState(false)
  const installing = phase === "installing"
  const downloading = phase === "downloading"
  const checking = phase === "checking"
  const ready = phase === "downloaded"
  const percent = progress.total ? Math.min(100, Math.round(progress.downloaded / progress.total * 100)) : null
  const title = checking ? "正在检查更新" : downloading ? "正在下载更新" : installing ? "正在安装更新" : ready ? "更新已准备好" : release ? `发现新版本 v${release.version}` : phase === "latest" ? "已是最新版本" : "保持应用为最新版本"

  return <><Dialog open={updater.open} onOpenChange={value => { if (!installing) updater.setOpen(value) }}><DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[580px]" showCloseButton={!installing} onEscapeKeyDown={event => { if (installing) event.preventDefault() }} onInteractOutside={event => { if (installing) event.preventDefault() }}>
    <DialogHeader className="shrink-0 border-b px-5 py-4"><DialogTitle>应用更新</DialogTitle><DialogDescription>Moss ProxySwitch · 当前版本 v{status?.current_version || version}</DialogDescription></DialogHeader>
    <ScrollArea className={release ? "h-[min(520px,calc(90dvh-160px))] min-h-0 overflow-hidden" : "h-[min(320px,calc(90dvh-160px))] min-h-0 overflow-hidden"}><div className="space-y-5 px-5 py-4">
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4" role="status" aria-live="polite">
        {checking || downloading || installing ? <Loader2 className="size-6 shrink-0 animate-spin text-primary" /> : ready || phase === "latest" ? <CheckCircle2 className="size-6 shrink-0 text-success" /> : <Download className="size-6 shrink-0 text-primary" />}
        <div className="min-w-0 space-y-1"><p className="font-medium">{title}</p><p className="text-xs leading-5 text-muted-foreground">{installing ? "应用即将重启，请稍候。" : ready ? "已通过签名校验，安装将在确认后开始。" : downloading ? "下载期间代理继续运行，可以关闭此窗口。" : release ? "查看更新内容后，可在方便时安装。" : "通过 GitHub Release 获取正式版本。"}</p></div>
      </div>
      {status?.reason && <Alert><AlertCircle /><AlertDescription>{status.reason}</AlertDescription></Alert>}
      {downloading && <div className="space-y-2"><Progress value={percent} aria-label="更新下载进度" aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? "正在下载" : `${percent}%`} /><p className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{size(progress.downloaded)}{progress.total ? ` / ${size(progress.total)}` : " · 正在下载"}</span>{percent !== null && <span>{percent}%</span>}</p></div>}
      {release && <div className="space-y-3"><div className="flex items-center gap-2 text-sm font-medium">更新内容<Badge variant="secondary">v{release.version}</Badge>{release.published_at && <span className="ml-auto text-xs font-normal text-muted-foreground">{new Date(release.published_at).toLocaleDateString("zh-CN")}</span>}</div><ScrollArea className="h-44 rounded-md border"><p className="whitespace-pre-wrap break-words p-4 text-sm leading-7 text-muted-foreground">{release.notes || "此版本未附更新说明，可前往发布页查看。"}</p></ScrollArea></div>}
      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription className="break-words">{error}</AlertDescription></Alert>}
      {editing && ready && <Alert><AlertCircle /><AlertDescription>请先完成或关闭正在编辑的表单，再安装更新。</AlertDescription></Alert>}
      <Separator />
      <SettingSwitch label="自动检查更新" description="启动后及运行期间每 6 小时检查一次。发现更新时提醒，安装前始终需要确认。" value={updater.autoCheck} onChange={updater.changeAutoCheck} disabled={installing} />
      {updater.lastChecked && <p className="text-xs text-muted-foreground">上次检查：{updater.lastChecked.toLocaleString("zh-CN")}</p>}
    </div></ScrollArea>
    <DialogFooter className="shrink-0 gap-2 border-t bg-muted/30 px-5 py-4 sm:justify-between"><Button type="button" variant="ghost" disabled={installing} onClick={() => void updater.openReleases()}><ExternalLink />发布页</Button><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!status?.check_supported || checking || downloading || installing || ready} onClick={() => void updater.check()}><RefreshCw className={checking ? "animate-spin" : ""} />{checking ? "检查中" : "检查更新"}</Button>{release && status?.install_supported && <Button type="button" disabled={checking || downloading || installing || (ready && editing)} onClick={() => ready ? setConfirm(true) : void updater.download()}>{downloading || installing ? <Loader2 className="animate-spin" /> : <Download />}{installing ? "安装中" : downloading ? "下载中" : ready ? "安装并重启" : "下载更新"}</Button>}</div></DialogFooter>
  </DialogContent></Dialog><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>安装更新并重启？</AlertDialogTitle><AlertDialogDescription>将备份当前配置、停止本应用托管的 Caddy，并安装 v{release?.version}。代理请求会短暂中断，重启后按启动设置运行，项目和环境配置会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>稍后安装</AlertDialogCancel><AlertDialogAction onClick={() => void updater.install()}>确认安装并重启</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>
}
