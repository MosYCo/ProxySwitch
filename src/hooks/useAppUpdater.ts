import { useCallback, useEffect, useRef, useState } from "react"
import { updaterApi, type AppUpdate, type UpdaterStatus, type UpdateProgress } from "@/api/updater"
import { useToastContext } from "@/contexts/ToastContext"

const preferenceKey = "caddy-proxy-tools.updates.auto-check"
type UpdatePhase = "idle" | "checking" | "latest" | "available" | "downloading" | "downloaded" | "installing" | "error"

export function useAppUpdater() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)
  const [phase, setPhase] = useState<UpdatePhase>("idle")
  const [release, setRelease] = useState<AppUpdate | null>(null)
  const [progress, setProgress] = useState<UpdateProgress>({ downloaded: 0, total: null })
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [open, setOpen] = useState(false)
  const [autoCheck, setAutoCheck] = useState(() => {
    try { return localStorage.getItem(preferenceKey) !== "false" } catch { return true }
  })
  const busy = useRef(false)
  const dialogOpen = useRef(open)
  const downloaded = useRef(false)
  const notified = useRef<string | null>(null)
  const { toast } = useToastContext()
  useEffect(() => { dialogOpen.current = open }, [open])

  useEffect(() => {
    let alive = true
    updaterApi.status().then(value => { if (alive) setStatus(value) }).catch(error => { if (alive) setError(String(error)) })
    return () => { alive = false }
  }, [])

  const check = useCallback(async (notify = false) => {
    if (busy.current || downloaded.current) return
    busy.current = true; setPhase("checking"); setError(null)
    try {
      const next = await updaterApi.check()
      setRelease(next); setLastChecked(new Date()); setPhase(next ? "available" : "latest")
      if (next && notified.current !== next.version) {
        notified.current = next.version
        if (notify && !dialogOpen.current) toast({ title: `发现新版本 v${next.version}`, description: "可在侧栏“应用更新”查看更新内容并下载安装。" })
      }
    } catch (error) {
      setError(String(error)); setPhase("error")
    } finally { busy.current = false }
  }, [toast])

  useEffect(() => {
    if (!autoCheck || !status?.check_supported) return
    const startup = window.setTimeout(() => { void check(true) }, 5000)
    const interval = window.setInterval(() => { void check(true) }, 6 * 60 * 60 * 1000)
    return () => { clearTimeout(startup); clearInterval(interval) }
  }, [autoCheck, status?.check_supported, check])

  const download = async () => {
    if (busy.current || !release || !status?.install_supported) return
    busy.current = true; setPhase("downloading"); setError(null); setProgress({ downloaded: 0, total: null })
    try {
      await updaterApi.download(setProgress)
      downloaded.current = true; setPhase("downloaded")
      if (!dialogOpen.current) toast({ title: "更新已准备好", description: "签名校验通过，可在方便时安装并重启。", variant: "success" })
    } catch (error) { setError(String(error)); setPhase("available") }
    finally { busy.current = false }
  }

  const install = async () => {
    if (busy.current || !downloaded.current || !status?.install_supported) return
    busy.current = true; setPhase("installing"); setError(null)
    try { await updaterApi.install() }
    catch (error) { setError(String(error)); setPhase("downloaded"); busy.current = false }
  }

  const openReleases = async () => {
    try { await updaterApi.openReleases() }
    catch (error) { setError(`无法打开发布页：${String(error)}`) }
  }

  const changeAutoCheck = (enabled: boolean) => {
    setAutoCheck(enabled)
    try { localStorage.setItem(preferenceKey, String(enabled)) } catch { /* Checking remains usable without preference storage. */ }
  }

  return { status, phase, release, progress, error, lastChecked, open, setOpen, autoCheck, changeAutoCheck, check, download, install, openReleases }
}

export type AppUpdater = ReturnType<typeof useAppUpdater>
