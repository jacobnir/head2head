/**
 * Every sound in the app is synthesized here — no audio files, no licensing, works
 * offline. Reads arcade rather than Hollywood, which suits the tone.
 *
 * If you ever want real samples (an actual airhorn, "LET'S GET READY TO RUMBLE"),
 * each function below is a single swappable call site.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

/** Browsers require a user gesture before audio can start. Called on the first click. */
export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.9
  master.connect(ctx.destination)
}

export function setMuted(next: boolean) {
  muted = next
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02)
}

export function isMuted() {
  return muted
}

function now() {
  return ctx!.currentTime
}

/** White noise buffer, cached. */
let noiseBuf: AudioBuffer | null = null
function noise(): AudioBufferSourceNode {
  if (!noiseBuf) {
    const len = ctx!.sampleRate * 2
    noiseBuf = ctx!.createBuffer(1, len, ctx!.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }
  const src = ctx!.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  return src
}

function envGain(attack: number, decay: number, peak: number, t = now()): GainNode {
  const g = ctx!.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(master!)
  return g
}

/** Guard so nothing throws if a sound fires before the first click. */
function ready(): boolean {
  return ctx !== null && master !== null
}

/* ──────────────────────────────────────────────────────────── */

/** Deep explosion: sub-bass sweep + lowpassed noise blast. */
export function boom(intensity = 1) {
  if (!ready()) return
  const t = now()

  const osc = ctx!.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120 * intensity, t)
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.55)
  const og = envGain(0.005, 0.6, 0.85 * intensity, t)
  osc.connect(og)
  osc.start(t)
  osc.stop(t + 0.7)

  const n = noise()
  const lp = ctx!.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1800, t)
  lp.frequency.exponentialRampToValueAtTime(120, t + 0.5)
  const ng = envGain(0.004, 0.55, 0.5 * intensity, t)
  n.connect(lp).connect(ng)
  n.start(t)
  n.stop(t + 0.7)
}

/** Short, hard hit — for the lane banner slam and stamps. */
export function impact(intensity = 1) {
  if (!ready()) return
  const t = now()

  const n = noise()
  const bp = ctx!.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(900, t)
  bp.Q.value = 0.8
  const g = envGain(0.002, 0.16, 0.55 * intensity, t)
  n.connect(bp).connect(g)
  n.start(t)
  n.stop(t + 0.2)

  const click = ctx!.createOscillator()
  click.type = 'square'
  click.frequency.setValueAtTime(180, t)
  click.frequency.exponentialRampToValueAtTime(48, t + 0.12)
  const cg = envGain(0.001, 0.13, 0.35 * intensity, t)
  click.connect(cg)
  click.start(t)
  click.stop(t + 0.15)
}

/** Boxing bell — two detuned partials, long metallic decay. */
export function bell() {
  if (!ready()) return
  const t = now()
  for (const [freq, gain, detune] of [
    [784, 0.35, 0],
    [1174, 0.22, 7],
    [2350, 0.1, -5],
  ] as const) {
    const o = ctx!.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    o.detune.value = detune
    const g = ctx!.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
    o.connect(g).connect(master!)
    o.start(t)
    o.stop(t + 1.9)
  }
}

/** Airhorn — three detuned saws with a pitch bend. */
export function airhorn() {
  if (!ready()) return
  const t = now()
  const g = ctx!.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.05)
  g.gain.setValueAtTime(0.3, t + 0.75)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95)

  const lp = ctx!.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3200
  g.connect(lp).connect(master!)

  for (const detune of [-12, 0, 11]) {
    const o = ctx!.createOscillator()
    o.type = 'sawtooth'
    o.detune.value = detune
    o.frequency.setValueAtTime(300, t)
    o.frequency.linearRampToValueAtTime(420, t + 0.12)
    o.frequency.setValueAtTime(420, t + 0.7)
    o.frequency.linearRampToValueAtTime(360, t + 0.95)
    o.connect(g)
    o.start(t)
    o.stop(t + 1.0)
  }
}

/** Movement — a fighter flying in, a card sliding out. */
export function whoosh(dur = 0.35) {
  if (!ready()) return
  const t = now()
  const n = noise()
  const bp = ctx!.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.4
  bp.frequency.setValueAtTime(320, t)
  bp.frequency.exponentialRampToValueAtTime(2600, t + dur)

  const g = ctx!.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.3, t + dur * 0.5)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  n.connect(bp).connect(g).connect(master!)
  n.start(t)
  n.stop(t + dur + 0.05)
}

/** Rising tension for the shuffle. Returns a stop() you must call. */
export function riser(dur = 2.5): () => void {
  if (!ready()) return () => {}
  const t = now()

  const g = ctx!.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.9)
  g.connect(master!)

  const o = ctx!.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(880, t + dur)

  const lp = ctx!.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(600, t)
  lp.frequency.exponentialRampToValueAtTime(5000, t + dur)

  o.connect(lp).connect(g)
  o.start(t)

  // Crowd swell underneath.
  const n = noise()
  const nlp = ctx!.createBiquadFilter()
  nlp.type = 'lowpass'
  nlp.frequency.value = 900
  const ng = ctx!.createGain()
  ng.gain.setValueAtTime(0.0001, t)
  ng.gain.exponentialRampToValueAtTime(0.18, t + dur)
  n.connect(nlp).connect(ng).connect(master!)
  n.start(t)

  let stopped = false
  return () => {
    if (stopped || !ctx) return
    stopped = true
    const end = ctx.currentTime + 0.12
    g.gain.cancelScheduledValues(ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    ng.gain.cancelScheduledValues(ctx.currentTime)
    ng.gain.exponentialRampToValueAtTime(0.0001, end)
    o.stop(end + 0.02)
    n.stop(end + 0.02)
  }
}

/** Rubber-stamp thud for hype tags. */
export function stamp() {
  if (!ready()) return
  impact(0.55)
}

/** Tick for roster selection / slot-machine frames. */
export function tick() {
  if (!ready()) return
  const t = now()
  const o = ctx!.createOscillator()
  o.type = 'square'
  o.frequency.value = 1200
  const g = envGain(0.001, 0.04, 0.09, t)
  o.connect(g)
  o.start(t)
  o.stop(t + 0.06)
}

/** Sirens — the SWAP curse. */
export function siren() {
  if (!ready()) return
  const t = now()
  const g = ctx!.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.08)
  g.gain.setValueAtTime(0.2, t + 1.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
  g.connect(master!)

  const o = ctx!.createOscillator()
  o.type = 'sawtooth'
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.45
    o.frequency.setValueAtTime(600, s)
    o.frequency.linearRampToValueAtTime(1000, s + 0.22)
    o.frequency.linearRampToValueAtTime(600, s + 0.44)
  }
  const lp = ctx!.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2400
  o.connect(lp).connect(g)
  o.start(t)
  o.stop(t + 1.45)
}

/** Low rumble — the EARTHQUAKE curse. */
export function rumble(dur = 1.6) {
  if (!ready()) return
  const t = now()
  const n = noise()
  const lp = ctx!.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 110

  const g = ctx!.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.25)
  g.gain.setValueAtTime(0.7, t + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  n.connect(lp).connect(g).connect(master!)
  n.start(t)
  n.stop(t + dur + 0.05)
}
