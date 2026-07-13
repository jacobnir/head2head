import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { checkRiotId, slugify } from '../lib/riotId'
import { PLACEHOLDER_FACE, ROSTER } from '../roster'
import { tick } from '../lib/audio'

type Props = {
  open: boolean
  onClose: () => void
  onAdded: (note: string | null) => void
}

/** Downscale before we ship it over the wire — phone photos are enormous. */
const MAX_DIM = 900

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not an image'))
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas unavailable'))

        // PNG, so transparency in a cutout survives.
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function AddPlayerModal({ open, onClose, onAdded }: Props) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [riotId, setRiotId] = useState('')
  const [platform, setPlatform] = useState('euw1')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const id = slugify(name)
  const riot = checkRiotId(riotId)
  const clash = id.length > 0 && ROSTER.some((p) => p.id === id)

  const nameError = !name.trim() ? null : clash ? `${name.toUpperCase()} is already on the roster` : null
  const riotError = riot.ok ? null : riot.reason
  const canSubmit = Boolean(name.trim()) && !clash && riot.ok && !busy

  const reset = () => {
    setName('')
    setNickname('')
    setRiotId('')
    setPlatform('euw1')
    setImageDataUrl(null)
    setError(null)
    setBusy(false)
  }

  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      setImageDataUrl(await readImage(file))
      tick()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that image')
    }
  }

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: name.trim(),
          nickname: nickname.trim() || undefined,
          // Already stripped of the League client's invisible characters.
          riotId: riot.ok ? riot.value || undefined : undefined,
          platform,
          imageDataUrl: imageDataUrl ?? undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not add player')

      reset()
      onAdded(data.syncNote ?? null)
    } catch (e) {
      // The API only exists under `npm run dev` — say so rather than failing cryptically.
      const msg = e instanceof Error ? e.message : 'Could not add player'
      setError(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? 'Adding players needs the dev server — run `npm run dev`'
          : msg,
      )
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="modal"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 15, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">NEW CHALLENGER</h2>

            <div className="modal-body">
              {/* ── Photo ─────────────────────────────────── */}
              <div
                className={`drop ${dragging ? 'dragging' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  void pickFile(e.dataTransfer.files[0])
                }}
              >
                <img
                  className="drop-preview"
                  src={imageDataUrl ?? PLACEHOLDER_FACE}
                  alt=""
                  draggable={false}
                />
                <span className="drop-hint">
                  {imageDataUrl ? 'CHANGE PHOTO' : 'DROP PHOTO / CLICK'}
                </span>
                {!imageDataUrl && <span className="drop-sub">optional — uses placeholder</span>}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void pickFile(e.target.files?.[0])}
                />
              </div>

              {/* ── Fields ────────────────────────────────── */}
              <div className="fields">
                <label className="field">
                  <span className="field-label">
                    NAME <em>shown on the fight card</em>
                  </span>
                  <input
                    className={`input ${nameError ? 'bad' : ''}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Kalle"
                    autoFocus
                    maxLength={16}
                  />
                  {nameError && <span className="field-error">{nameError}</span>}
                </label>

                <label className="field">
                  <span className="field-label">
                    RIOT ID <em>optional — for rank &amp; champs</em>
                  </span>
                  <input
                    className={`input ${riotError ? 'bad' : ''}`}
                    value={riotId}
                    onChange={(e) => setRiotId(e.target.value)}
                    placeholder="Kalle#EUW"
                    spellCheck={false}
                  />
                  {riotError ? (
                    <span className="field-error">{riotError}</span>
                  ) : riot.ok && riot.cleaned ? (
                    // The League client hides bidi characters in the tag. Say what we did.
                    <span className="field-ok">✓ cleaned hidden characters from the paste</span>
                  ) : null}
                </label>

                <div className="field-row">
                  <label className="field grow">
                    <span className="field-label">
                      NICKNAME <em>optional</em>
                    </span>
                    <input
                      className="input"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="random hype tag"
                      maxLength={24}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">SERVER</span>
                    <select
                      className="input"
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                    >
                      <option value="euw1">EUW</option>
                      <option value="eun1">EUNE</option>
                      <option value="na1">NA</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button className="btn ghost" onClick={close} type="button" disabled={busy}>
                CANCEL
              </button>
              <button className="btn primary" onClick={submit} type="button" disabled={!canSubmit}>
                {busy ? 'ADDING…' : 'ADD TO ROSTER'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
