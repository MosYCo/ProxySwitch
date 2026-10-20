import { useCallback, useEffect, useState } from "react"
import { settingsApi } from "@/api"
import { defaultSettings } from "@/lib/settings"

export function useAppSettings() {
  const [settings, setSettings] = useState(defaultSettings)
  const refresh = useCallback(async () => {
    try { setSettings((await settingsApi.get()).settings) }
    catch (error) { console.error("读取设置失败", error) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { settings, refresh }
}
