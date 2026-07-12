/**
 * A tiny particle system driven by one shared rAF loop. Explosions look dramatically
 * better on a canvas than as animated DOM nodes, and this idles to zero cost when
 * nothing is alive.
 */

type Ember = {
  kind: 'ember'
  x: number; y: number; vx: number; vy: number
  life: number; max: number
  size: number; hue: number
}

type Ring = {
  kind: 'ring'
  x: number; y: number
  life: number; max: number
  radius: number; speed: number; width: number; color: string
}

type Bolt = {
  kind: 'bolt'
  x: number; y: number; angle: number; len: number
  life: number; max: number; seed: number
}

type Confetti = {
  kind: 'confetti'
  x: number; y: number; vx: number; vy: number
  life: number; max: number
  size: number; rot: number; vrot: number; color: string
}

type Smoke = {
  kind: 'smoke'
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number
}

type Particle = Ember | Ring | Bolt | Confetti | Smoke

let particles: Particle[] = []
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let last = 0

export function attach(el: HTMLCanvasElement) {
  canvas = el
  ctx = el.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
}

export function detach() {
  window.removeEventListener('resize', resize)
  cancelAnimationFrame(raf)
  raf = 0
  particles = []
  canvas = null
  ctx = null
}

function resize() {
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function ensureLoop() {
  if (raf) return
  last = performance.now()
  raf = requestAnimationFrame(tick)
}

function tick(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now

  if (!ctx || !canvas) {
    raf = 0
    return
  }

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

  for (const p of particles) p.life += dt
  particles = particles.filter((p) => p.life < p.max)

  for (const p of particles) draw(p, dt)

  if (particles.length === 0) {
    // Nothing left — stop burning frames until something spawns.
    raf = 0
    return
  }
  raf = requestAnimationFrame(tick)
}

function draw(p: Particle, dt: number) {
  const c = ctx!
  const t = p.life / p.max
  const fade = 1 - t

  switch (p.kind) {
    case 'ember': {
      p.vy += 900 * dt // gravity
      p.vx *= 0.98
      p.vy *= 0.98
      p.x += p.vx * dt
      p.y += p.vy * dt
      c.globalCompositeOperation = 'lighter'
      c.fillStyle = `hsla(${p.hue}, 100%, ${55 + fade * 30}%, ${fade})`
      c.beginPath()
      c.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2)
      c.fill()
      c.globalCompositeOperation = 'source-over'
      break
    }
    case 'ring': {
      p.radius += p.speed * dt
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = p.color
      c.globalAlpha = fade * fade
      c.lineWidth = p.width * fade
      c.beginPath()
      c.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      c.stroke()
      c.globalAlpha = 1
      c.globalCompositeOperation = 'source-over'
      break
    }
    case 'bolt': {
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = `rgba(190, 235, 255, ${fade})`
      c.lineWidth = 3 * fade
      c.shadowBlur = 18
      c.shadowColor = '#8ad8ff'
      c.beginPath()
      let x = p.x
      let y = p.y
      c.moveTo(x, y)
      const steps = 7
      for (let i = 1; i <= steps; i++) {
        const seg = p.len / steps
        // Deterministic jitter per bolt so it doesn't crawl between frames.
        const j = Math.sin(p.seed + i * 12.9898) * 22
        x += Math.cos(p.angle) * seg + Math.cos(p.angle + Math.PI / 2) * j * 0.35
        y += Math.sin(p.angle) * seg + Math.sin(p.angle + Math.PI / 2) * j * 0.35
        c.lineTo(x, y)
      }
      c.stroke()
      c.shadowBlur = 0
      c.globalCompositeOperation = 'source-over'
      break
    }
    case 'smoke': {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy -= 30 * dt // drifts up
      c.fillStyle = `rgba(40, 36, 44, ${fade * 0.35})`
      c.beginPath()
      c.arc(p.x, p.y, p.size * (0.6 + t * 1.6), 0, Math.PI * 2)
      c.fill()
      break
    }
    case 'confetti': {
      p.vy += 700 * dt
      p.vx *= 0.995
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vrot * dt
      c.save()
      c.translate(p.x, p.y)
      c.rotate(p.rot)
      c.globalAlpha = fade
      c.fillStyle = p.color
      c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      c.restore()
      c.globalAlpha = 1
      break
    }
  }
}

/* ──────────────────────────────────────────────────────────── */

export function spawnExplosion(x: number, y: number, scale = 1) {
  const count = Math.round(110 * scale)
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const speed = (140 + Math.random() * 620) * scale
    particles.push({
      kind: 'ember',
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 120,
      life: 0,
      max: 0.5 + Math.random() * 0.8,
      size: 2 + Math.random() * 5 * scale,
      hue: 20 + Math.random() * 40, // orange → yellow
    })
  }

  const rings: Array<[string, number, number]> = [
    ['rgba(255,255,255,0.95)', 1400, 9],
    ['rgba(255,170,60,0.9)', 950, 6],
    ['rgba(255,60,40,0.75)', 620, 4],
  ]
  rings.forEach(([color, speed, width], i) => {
    particles.push({
      kind: 'ring', x, y, life: -i * 0.04, max: 0.55, radius: 8, speed: speed * scale, width, color,
    })
  })

  for (let i = 0; i < 6; i++) {
    particles.push({
      kind: 'bolt',
      x, y,
      angle: Math.random() * Math.PI * 2,
      len: (120 + Math.random() * 180) * scale,
      life: 0,
      max: 0.18 + Math.random() * 0.12,
      seed: Math.random() * 1000,
    })
  }

  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2
    particles.push({
      kind: 'smoke',
      x, y,
      vx: Math.cos(a) * 90 * scale,
      vy: Math.sin(a) * 90 * scale,
      life: 0,
      max: 0.9 + Math.random() * 0.7,
      size: 20 + Math.random() * 40 * scale,
    })
  }

  ensureLoop()
}

export function spawnConfetti(count = 160) {
  const colors = ['#4da3ff', '#ff3b3b', '#ffd23f', '#ffffff', '#7cf5a0', '#c77dff']
  for (let i = 0; i < count; i++) {
    particles.push({
      kind: 'confetti',
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 160,
      vy: 120 + Math.random() * 220,
      life: 0,
      max: 2.6 + Math.random() * 1.6,
      size: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 12,
      color: colors[(Math.random() * colors.length) | 0],
    })
  }
  ensureLoop()
}

/** Sparks trailing a fighter as they rocket in. */
export function spawnTrail(x: number, y: number, dir: 1 | -1, hue: number) {
  for (let i = 0; i < 18; i++) {
    particles.push({
      kind: 'ember',
      x, y: y + (Math.random() - 0.5) * 90,
      vx: -dir * (200 + Math.random() * 400),
      vy: (Math.random() - 0.5) * 160,
      life: 0,
      max: 0.3 + Math.random() * 0.4,
      size: 2 + Math.random() * 3,
      hue,
    })
  }
  ensureLoop()
}

export function clearParticles() {
  particles = []
}
