import { useEffect, useState, type FormEvent } from "react"
import { AlertCircle, Loader2, Save } from "lucide-react"
import { caddyApi } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

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
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Caddy 设置</DialogTitle>
          <DialogDescription>配置 Caddy admin API 的监听地址。</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <FieldGroup>
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="caddy-admin">管理地址</FieldLabel>
                <Input
                  id="caddy-admin"
                  value={admin}
                  onChange={(event) => setAdmin(event.target.value)}
                  placeholder="localhost:2019"
                  className="font-mono"
                  disabled={loading || saving}
                  aria-invalid={!!error}
                />
                <FieldDescription>
                  默认是 localhost:2019，修改后会用于读取和重载 Caddy 配置。
                </FieldDescription>
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </FieldGroup>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading || saving}>
              {saving ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
