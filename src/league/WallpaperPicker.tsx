import { useRef, useState } from 'react'
import { shrinkWallpaper } from './wallpaper'

/** Upload / replace / remove a league's backdrop. Shows a little framed preview. */
export function WallpaperPicker({ value, onChange, compact = false }: {
  value?: string
  onChange: (dataUrl: string | null) => void
  compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File) => {
    setBusy(true); setError(null)
    try { onChange(await shrinkWallpaper(file)) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return <div className={`lg-wallpaper-picker ${compact ? 'compact' : ''}`}>
    <input ref={input} type="file" accept="image/*" hidden aria-label="Upload league wallpaper"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f) }} />
    {!compact && <span className="lg-wallpaper-preview" style={value ? { backgroundImage: `url("${value}")` } : undefined}>
      {!value && '🖼️'}</span>}
    <div className="tn-actions">
      <button type="button" className="tn-button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Shrinking…' : value ? '🖼️ Change wallpaper' : '🖼️ Upload wallpaper'}</button>
      {value && <button type="button" className="tn-button danger" disabled={busy} onClick={() => onChange(null)}>Remove</button>}
    </div>
    {error && <p className="tn-error" role="alert">{error}</p>}
  </div>
}
