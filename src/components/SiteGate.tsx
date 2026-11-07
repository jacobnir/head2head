import { useState, type FormEvent, type ReactNode } from 'react'

const EXPECTED = import.meta.env.VITE_SITE_CODE_SHA256?.trim().toLowerCase()
const UNLOCK_KEY = 'fightnight.unlocked'
/** The code itself, so /api/players can check it. The bundle only ever has the hash. */
const CODE_KEY = 'fightnight.code'

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

/** The entered code, for API writes. Empty when the build has no gate. */
export function siteCode(): string {
  try { return localStorage.getItem(CODE_KEY) ?? '' } catch { return '' }
}

// Visitors from before the code was remembered have the unlock flag but no code: ask once
// more, otherwise their first "add player" would fail with a wrong-code error.
function remembered() {
  try { return localStorage.getItem(UNLOCK_KEY) === EXPECTED && Boolean(localStorage.getItem(CODE_KEY)) } catch { return false }
}

/**
 * Keeps randoms off the hosted copy. On its own it's a speed bump: a static site ships
 * everything to the browser. What it really guards is /api/players, which re-checks the
 * code server-side before anyone can change the live roster.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => !EXPECTED || remembered())
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)
  if (open) return <>{children}</>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const normalised = normaliseCode(code)
    if (await sha256(normalised) === EXPECTED) {
      try {
        localStorage.setItem(UNLOCK_KEY, EXPECTED!)
        localStorage.setItem(CODE_KEY, normalised)
      } catch { /* still let them in this visit */ }
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
