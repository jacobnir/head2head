import { animate, motion, useMotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { bell, tick } from '../lib/audio'
import { mulberry32 } from '../lib/rng'
import { spawnConfetti } from '../fx/particles'
import { shake } from '../fx/screen'

const COLORS = ['#ffd23f', '#2b6cff', '#ff3b3b', '#1d1d29']
const SPIN_MS = 5200

/** Angles are degrees clockwise from 12 o'clock, where the pointer sits. */
const point = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180
  return `${(Math.sin(rad) * r).toFixed(2)} ${(-Math.cos(rad) * r).toFixed(2)}`
}

/**
 * The outcome is decided by the engine BEFORE the spin; this only animates to it. So a
 * replay, a refresh mid-spin, or a laggy screen-share can never land somewhere else.
 */
export function Wheel({ segments, landed, seed, animateSpin, onLanded }: {
  segments: number[]
  /** Segment index the engine picked; undefined while waiting for the spin. */
  landed?: number
  seed: number
  /** false shows the landed result at rest (revisiting a match). */
  animateSpin: boolean
  onLanded: () => void
}) {
  const rotate = useMotionValue(0)
  const seg = 360 / segments.length
  const done = useRef(onLanded)
  done.current = onLanded

  useEffect(() => {
    if (landed === undefined) return
    // Land somewhere inside the segment, not dead centre, so it looks honest.
    const jitter = (mulberry32(seed)() - 0.5) * seg * 0.7
    const target = 360 * 8 - ((landed + 0.5) * seg + jitter)
    if (!animateSpin) {
      rotate.set(target)
      return
    }
    let last = -1
    const controls = animate(rotate, target, {
      duration: SPIN_MS / 1000,
      ease: [0.12, 0.75, 0.15, 1],
      onUpdate: (v) => {
        const under = Math.floor((((-v % 360) + 360) % 360) / seg)
        if (under !== last) { last = under; tick() }
      },
      onComplete: () => {
        bell(); shake(10, 350); spawnConfetti(140)
        done.current()
      },
    })
    return () => controls.stop()
  }, [landed, animateSpin, seed, seg, rotate])

  return <div className="lg-wheel">
    <div className="lg-wheel-pointer" aria-hidden="true" />
    <motion.svg viewBox="-110 -110 220 220" style={{ rotate }} role="img"
      aria-label={landed === undefined ? 'Points wheel' : `Wheel landed on ${segments[landed]}`}>
      <circle r="106" fill="#0d0d14" stroke="#ffd23f" strokeWidth="3" />
      {segments.map((value, i) => {
        const a0 = i * seg
        const a1 = (i + 1) * seg
        const mid = a0 + seg / 2
        const color = COLORS[i % COLORS.length]
        return <g key={i}>
          <path d={`M 0 0 L ${point(a0, 100)} A 100 100 0 ${seg > 180 ? 1 : 0} 1 ${point(a1, 100)} Z`}
            fill={color} stroke="#0d0d14" strokeWidth="2" />
          <text transform={`rotate(${mid}) translate(0 -66)`} textAnchor="middle" dominantBaseline="middle"
            className="lg-wheel-label" fill={color === '#ffd23f' ? '#17120a' : '#f3f0e7'}>{value}</text>
        </g>
      })}
      <circle r="16" fill="#ffd23f" stroke="#0d0d14" strokeWidth="3" />
    </motion.svg>
  </div>
}
