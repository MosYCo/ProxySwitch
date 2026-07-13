import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { caddyApi } from "@/api"

interface CaddySettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function CaddySettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: CaddySettingsDialogProps) {
  const [admin, setAdmin] = useState("localhost:2019")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const loadSettings = async () => {
      try {
        setLoading(true)
        setError(null)
        const settings = await caddyApi.getSettings()
        setAdmin(settings.admin)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setSaving(true)
      setError(null)
      const settings = await caddyApi.updateSettings(admin)
      setAdmin(settings.admin)
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-card border-border">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display">Caddy 设置</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              配置 Caddy admin API 监听地址
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="caddy-admin" className="text-xs font-mono">
              管理地址
            </Label>
            <Input
              id="caddy-admin"
              value={admin}
              onChange={(event) => setAdmin(event.target.value)}
              placeholder="localhost:2019"
              className="font-mono text-sm"
              disabled={loading || saving}
            />
            {error && (
              <p className="text-xs font-mono text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading || saving}>
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
