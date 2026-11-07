import { useState, type FormEvent, type ReactNode } from 'react'

const EXPECTED = import.meta.env.VITE_SITE_CODE_SHA256?.trim().toLowerCase()
const UNLOCK_KEY = 'fightnight.unlocked'

/**
 * Phones capitalise the first letter, and some keyboards type "å" as a + combining ring
 * (two code points). Normalise both away so the code works however it's typed. The
 * build-time hash must be made from the same normalised form.
 */
export const normaliseCode = (code: string) => code.trim().normalize('NFC').toLowerCase()

async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function remembered() {
  try { return localStorage.getItem(UNLOCK_KEY) === EXPECTED } catch { return false }
}

/**
 * Keeps randoms off the hosted copy. It's a speed bump, not security: a static site
 * ships everything to the browser, so anyone determined can read the files directly.
 * Only the code's hash is in the bundle, never the code itself.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => !EXPECTED || remembered())
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)
  if (open) return <>{children}</>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await sha256(normaliseCode(code)) === EXPECTED) {
      try { localStorage.setItem(UNLOCK_KEY, EXPECTED!) } catch { /* still let them in this visit */ }
      setOpen(true)
    } else setWrong(true)
  }

  return <div className="site-gate">
    <form onSubmit={submit}>
      <h1 className="title"><span className="title-fight">IN</span> <span className="title-night">HOUSE</span></h1>
      <label>Enter the code<input autoFocus value={code} onChange={(e) => { setCode(e.target.value); setWrong(false) }}
        autoComplete="off" autoCapitalize="off" spellCheck={false} /></label>
      {wrong && <p role="alert">Nope. Ask in Discord.</p>}
      <button className="btn primary" type="submit">ENTER</button>
    </form>
  </div>
}
