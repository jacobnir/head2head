import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FighterCard, type Beat } from '../components/FighterCard'
import { LaneBanner } from '../components/LaneBanner'
import { OddsBoard } from '../components/OddsBoard'
import { boom, impact, rumble, siren, stamp, whoosh } from '../lib/audio'
import { hypeTagFor, oddsFor } from '../lib/randomize'
import { spawnExplosion, spawnTrail } from '../fx/particles'
import { bigHit, invertStrobe, shake } from '../fx/screen'
import type { CurseType, Matchup, Player } from '../types'

const CURSE_COPY: Record<CurseType, { title: string; sub: string; cls: string }> = {
  SWAP: {
    title: 'PLOT TWIST',
    sub: 'THESE TWO ARE SWAPPING TEAMS',
    cls: 'curse-swap',
  },
  EARTHQUAKE: {
    title: 'EARTHQUAKE',
    sub: 'THIS LANE HAS BEEN RE-DRAWN',
    cls: 'curse-quake',
  },
  CURSED_LANE: {
    title: 'CURSED LANE',
    sub: 'LOSER BUYS FOOD. NO EXCEPTIONS.',
    cls: 'curse-cursed',
  },
}

/** How long the curse interlude holds the screen. */
const curseDuration = (t: CurseType) => (t === 'CURSED_LANE' ? 2200 : 2800)

/**
 * PLAYING  — the sequence is running
 * HOLD     — it's finished and is waiting for you. Nothing auto-advances.
 * EXITING  — you've advanced; the fighters are flying out
 */
type Phase = 'PLAYING' | 'HOLD' | 'EXITING'

type Props = {
  matchup: Matchup
  index: number
  total: number
  seed: number
  /** Increments each time the user asks to move on. */
  advanceSignal: number
  onComplete: () => void
}

export function LaneReveal({ matchup, index, total, seed, advanceSignal, onComplete }: Props) {
  const curse = matchup.curse
  const rearranges = Boolean(curse && curse.before)

  // Show the pre-curse pairing first; the curse interlude swaps us onto the real one.
  const [pair, setPair] = useState<{ blue: Player; red: Player }>(
    () => curse?.before ?? { blue: matchup.blue, red: matchup.red },
  )
  const [blueBeat, setBlueBeat] = useState<Beat>('IDLE')
  const [redBeat, setRedBeat] = useState<Beat>('IDLE')
  const [showVs, setShowVs] = useState(false)
  const [showOdds, setShowOdds] = useState(false)
  const [curseOn, setCurseOn] = useState(false)
  const [phase, setPhase] = useState<Phase>('PLAYING')

  const timers = useRef<number[]>([])
  const phaseRef = useRef<Phase>('PLAYING')
  phaseRef.current = phase

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }, [])

  /** Drop everything and land on the finished state immediately. */
  const fastForward = useCallback(() => {
    clearTimers()
    setPair({ blue: matchup.blue, red: matchup.red }) // curse already resolved
    setCurseOn(false)
    setShowVs(true)
    setShowOdds(true)
    setBlueBeat('TAGS')
    setRedBeat('TAGS')
    setPhase('HOLD')
  }, [clearTimers, matchup])

  /** Blow them off-screen and hand over to the next bout. */
  const exit = useCallback(() => {
    clearTimers()
    setPhase('EXITING')
    setBlueBeat('OUT')
    setRedBeat('OUT')
    setShowVs(false)
    setShowOdds(false)
    whoosh(0.4)
    timers.current.push(window.setTimeout(onComplete, 480))
  }, [clearTimers, onComplete])

  // ── The user asked to move on ──────────────────────────────
  useEffect(() => {
    if (advanceSignal === 0) return // initial mount, not a real press

    if (phaseRef.current === 'PLAYING') fastForward()
    else if (phaseRef.current === 'HOLD') exit()
    // EXITING: already on the way out, ignore
  }, [advanceSignal, fastForward, exit])

  // ── The sequence itself ────────────────────────────────────
  useEffect(() => {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight * 0.44

    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms))
    }

    // ── Entrances ───────────────────────────────────────────
    at(100, () => impact(0.9))
    at(100, () => shake(14, 320))

    at(900, () => {
      setBlueBeat('IN')
      whoosh(0.45)
      spawnTrail(window.innerWidth * 0.3, cy, -1, 200) // blue sparks
    })

    at(1900, () => {
      setRedBeat('IN')
      whoosh(0.45)
      spawnTrail(window.innerWidth * 0.7, cy, 1, 5) // red sparks
    })

    // ── Collision ───────────────────────────────────────────
    at(2900, () => {
      setBlueBeat('LUNGE')
      setRedBeat('LUNGE')
      whoosh(0.25)
    })

    at(3250, () => {
      setBlueBeat('IMPACT')
      setRedBeat('IMPACT')
      setShowVs(true)
      boom(1)
      bigHit()
      spawnExplosion(cx, cy, 1.15)
    })

    // ── Curse interlude (optional) ──────────────────────────
    let cursor = 4100

    if (curse) {
      const { type } = curse
      const dur = curseDuration(type)

      at(cursor, () => {
        setCurseOn(true)
        if (type === 'SWAP') {
          siren()
          invertStrobe(900)
          shake(18, 900)
        } else if (type === 'EARTHQUAKE') {
          rumble(1.8)
          shake(30, 1700)
        } else {
          boom(0.6)
          shake(10, 600)
        }

        if (rearranges) {
          // Blow the current pairing off-screen; the real one flies back in.
          setBlueBeat('OUT')
          setRedBeat('OUT')
          whoosh(0.35)
        }
      })

      if (rearranges) {
        at(cursor + 1100, () => {
          setPair({ blue: matchup.blue, red: matchup.red })
          setBlueBeat('IDLE')
          setRedBeat('IDLE')
        })
        at(cursor + 1400, () => {
          setBlueBeat('IN')
          setRedBeat('IN')
          whoosh(0.4)
          impact(0.7)
          spawnExplosion(cx, cy, 0.5)
        })
      }

      at(cursor + dur - 300, () => setCurseOn(false))
      cursor += dur
    }

    // ── Stats, odds, hype tags ──────────────────────────────
    at(cursor, () => {
      setBlueBeat('STATS')
      setRedBeat('STATS')
      setShowOdds(true)
    })

    at(cursor + 1800, () => {
      setBlueBeat('TAGS')
      setRedBeat('TAGS')
      stamp()
      shake(6, 160)
    })

    // ── Done. Hold here until told otherwise. ───────────────
    at(cursor + 3200, () => setPhase('HOLD'))

    const scheduled = timers.current
    return () => {
      scheduled.forEach(window.clearTimeout)
      timers.current = []
    }
  }, [matchup, curse, rearranges])

  const odds = oddsFor(matchup, seed)
  const last = index === total - 1

  return (
    <div className="lane-reveal">
      <LaneBanner lane={matchup.lane} index={index} total={total} />

      <div className="arena">
        <FighterCard
          player={pair.blue}
          team="BLUE"
          beat={blueBeat}
          seed={seed}
          hypeTag={hypeTagFor(pair.blue, seed)}
        />

        <div className="vs-slot">
          <AnimatePresence>
            {showVs && (
              <motion.div
                className="vs"
                initial={{ scale: 4, opacity: 0, rotate: -25 }}
                animate={{ scale: 1, opacity: 1, rotate: -6 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 15 }}
              >
                VS
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <FighterCard
          player={pair.red}
          team="RED"
          beat={redBeat}
          seed={seed}
          hypeTag={hypeTagFor(pair.red, seed)}
        />
      </div>

      <div className="odds-slot">
        <OddsBoard odds={odds} show={showOdds} />
      </div>

      {/* Nothing moves on its own — this is the only way forward. */}
      <AnimatePresence>
        {phase === 'HOLD' && (
          <motion.div
            className="advance-prompt"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3 }}
          >
            <motion.span
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              {last ? 'PRESS SPACE FOR THE FIGHT CARD' : 'PRESS SPACE FOR THE NEXT BOUT'}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {curseOn && curse && (
          <motion.div
            className={`curse-overlay ${CURSE_COPY[curse.type].cls}`}
            initial={{ opacity: 0, scale: 1.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          >
            <motion.h2
              className="curse-title"
              animate={{ scale: [1, 1.06, 1], rotate: [-1.5, 1.5, -1.5] }}
              transition={{ duration: 0.35, repeat: Infinity }}
            >
              {CURSE_COPY[curse.type].title}
            </motion.h2>
            <p className="curse-sub">{CURSE_COPY[curse.type].sub}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
