import { motion } from 'framer-motion'
import { useState } from 'react'
import { Face } from '../components/Face'
import { LANE_ICON } from '../components/LaneBanner'
import { RankBadge } from '../components/RankBadge'
import { impact, initAudio, whoosh } from '../lib/audio'
import { statsFor } from '../lib/stats'
import { LANES, type Team } from '../types'
import { teamWinPct } from './engine'
import type { League, LeagueMatch } from './types'

const LANE_QUIP: Record<(typeof LANES)[number], string> = {
  TOP: 'island life',
  JUNGLE: 'blame magnet',
  MID: 'main character',
  ADC: 'needs a babysitter',
  SUPPORT: 'nobody wants it',
}

/**
 * Each team tells the host who plays what. Tap a head, tap another on the same team and
 * they swap. No dropdowns: on a screen-share everyone can see who got stuck with support.
 */
export function LanePicker({ league, match, onConfirm, onBack }: {
  league: League
  match: LeagueMatch
  onConfirm: (blue: string[], red: string[]) => void
  onBack: () => void
}) {
  const [orders, setOrders] = useState<Record<Team, string[]>>(() => ({
    BLUE: match.result ? match.result.matchups.map((m) => m.blue.id) : match.blue!,
    RED: match.result ? match.result.matchups.map((m) => m.red.id) : match.red!,
  }))
  const [picked, setPicked] = useState<{ side: Team; lane: number } | null>(null)
  const player = (id: string) => league.players.find((p) => p.id === id)!
  const pct = teamWinPct(orders.BLUE.map(player), orders.RED.map(player))

  const tap = (side: Team, lane: number) => {
    initAudio()
    if (!picked || picked.side !== side) { whoosh(0.15); setPicked({ side, lane }); return }
    if (picked.lane !== lane) {
      impact(0.4)
      setOrders((cur) => {
        const order = [...cur[side]]
        ;[order[lane], order[picked.lane]] = [order[picked.lane], order[lane]]
        return { ...cur, [side]: order }
      })
    }
    setPicked(null)
  }
  const chaos = (side: Team) => {
    initAudio(); impact(0.7); setPicked(null)
    setOrders((cur) => ({ ...cur, [side]: [...cur[side]].sort(() => Math.random() - 0.5) }))
  }

  return <div className="tn-page lg-picker">
    <header className="tn-heading"><div><span className="tn-eyebrow">MATCH {match.index + 1} · TEAMS PICK LANES</span><h1>Who plays where?</h1>
      <span className="tn-sticker">TAP A HEAD, THEN TAP WHO THEY SWAP WITH</span></div>
      <button className="tn-button" onClick={onBack}>← League</button></header>

    <div className="lg-pick-grid">{(['BLUE', 'RED'] as const).map((side) => {
      const chance = pct === null ? null : side === 'BLUE' ? pct : 100 - pct
      return <section key={side} className={`lg-pick-team ${side.toLowerCase()}`}>
        <header>
          <h2>{side === 'BLUE' ? '🔵' : '🔴'} {side} SIDE</h2>
          <span className="lg-stake-sticker">WIN = +{match.stake![side]} PTS</span>
          {chance !== null && <small>{chance >= 60 ? '😎 favourites' : chance <= 40 ? '🙏 underdogs' : '🤝 coin flip'} · {chance}%</small>}
        </header>
        {LANES.map((lane, i) => {
          const p = player(orders[side][i])
          const isPicked = picked?.side === side && picked.lane === i
          const isTarget = picked?.side === side && !isPicked
          return <motion.button key={lane} type="button" layout
            className={`lg-lane-slot ${isPicked ? 'picked' : ''} ${isTarget ? 'target' : ''}`}
            onClick={() => tap(side, i)} aria-pressed={isPicked} aria-label={`${lane}: ${p.name}`}>
            <span className="lg-lane-icon" aria-hidden="true">{LANE_ICON[lane]}</span>
            <span className="lg-lane-name"><b>{lane}</b><small>{LANE_QUIP[lane]}</small></span>
            <motion.span className="lg-lane-head" key={p.id} initial={{ scale: 0.3, rotate: -25 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 12 }}>
              <Face src={p.img} alt="" className="tn-cutout" />
            </motion.span>
            <span className="lg-lane-player"><strong className="tn-name-tape">{p.name}</strong><RankBadge rank={statsFor(p)?.rank} short /></span>
          </motion.button>
        })}
        <button type="button" className="tn-button lg-chaos" onClick={() => chaos(side)}>🎲 Can’t agree? Let fate decide</button>
      </section>
    })}</div>

    <div className="tn-setup-footer"><p>Changed your mind after the reveal? Come back here any time before the result is in.</p>
      <button className="tn-button gold tn-big-button" onClick={() => onConfirm(orders.BLUE, orders.RED)}>🔒 Lock it in &amp; reveal</button></div>
  </div>
}
