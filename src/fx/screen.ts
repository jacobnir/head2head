/**
 * Screen-level effects. These drive CSS custom properties / classes on <body> rather
 * than going through React state — they fire dozens of times a second during an impact
 * and re-rendering the tree for each would be silly.
 */

let shakeRaf = 0
let shakeUntil = 0
let shakeMag = 0

/** Camera shake. `mag` in px, `dur` in ms. Stacks: a bigger shake overrides a smaller. */
export function shake(mag = 12, dur = 400) {
  const now = performance.now()
  shakeMag = Math.max(shakeMag, mag)
  shakeUntil = Math.max(shakeUntil, now + dur)

  if (shakeRaf) return

  const step = () => {
    const t = performance.now()
    if (t >= shakeUntil) {
      document.body.style.setProperty('--shake-x', '0px')
      document.body.style.setProperty('--shake-y', '0px')
      document.body.style.setProperty('--shake-r', '0deg')
      shakeRaf = 0
      shakeMag = 0
      return
    }
    // Decay toward the end so it settles instead of cutting out.
    const remaining = (shakeUntil - t) / dur
    const m = shakeMag * Math.min(remaining, 1)
    document.body.style.setProperty('--shake-x', `${(Math.random() - 0.5) * 2 * m}px`)
    document.body.style.setProperty('--shake-y', `${(Math.random() - 0.5) * 2 * m}px`)
    document.body.style.setProperty('--shake-r', `${(Math.random() - 0.5) * 0.4 * (m / 12)}deg`)
    shakeRaf = requestAnimationFrame(step)
  }
  shakeRaf = requestAnimationFrame(step)
}

/** Full-screen white flash. */
export function flash(dur = 220) {
  const el = document.createElement('div')
  el.className = 'fx-flash'
  el.style.animationDuration = `${dur}ms`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), dur + 50)
}

/** Brief RGB split across the whole page. */
export function aberrate(dur = 260) {
  document.body.classList.add('fx-aberrate')
  window.setTimeout(() => document.body.classList.remove('fx-aberrate'), dur)
}

/** Freeze-frame on impact. Reads as weight — the hit "lands". */
export function hitstop(dur = 90) {
  document.body.classList.add('fx-hitstop')
  window.setTimeout(() => document.body.classList.remove('fx-hitstop'), dur)
}

/** Colour-inverted strobe — the SWAP curse. */
export function invertStrobe(dur = 900) {
  document.body.classList.add('fx-invert')
  window.setTimeout(() => document.body.classList.remove('fx-invert'), dur)
}

/** Everything at once. The money shot. */
export function bigHit() {
  flash(200)
  shake(26, 520)
  aberrate(300)
  hitstop(100)
}

export function resetScreen() {
  document.body.classList.remove('fx-aberrate', 'fx-hitstop', 'fx-invert')
  document.body.style.setProperty('--shake-x', '0px')
  document.body.style.setProperty('--shake-y', '0px')
  document.body.style.setProperty('--shake-r', '0deg')
  cancelAnimationFrame(shakeRaf)
  shakeRaf = 0
  shakeMag = 0
  shakeUntil = 0
}
