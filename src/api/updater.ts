import { Channel, invoke } from "@tauri-apps/api/core"

export interface UpdaterStatus {
  current_version: string
  check_supported: boolean
  install_supported: boolean
  reason: string | null
}
export interface AppUpdate { version: string; notes: string; published_at: string | null }
export interface UpdateProgress { downloaded: number; total: number | null }

export const updaterApi = {
  status: () => invoke<UpdaterStatus>("get_updater_status"),
  check: () => invoke<AppUpdate | null>("check_app_update"),
  download: (onProgress: (progress: UpdateProgress) => void) => {
    const channel = new Channel<UpdateProgress>()
    channel.onmessage = onProgress
    return invoke<void>("download_app_update", { onProgress: channel })
  },
  install: () => invoke<void>("install_app_update"),
  openReleases: () => invoke<void>("open_release_page"),
}
