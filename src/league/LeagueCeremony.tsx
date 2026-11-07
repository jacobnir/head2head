import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { airhorn, bell, initAudio } from '../lib/audio'
import { clearParticles, spawnConfetti } from '../fx/particles'
import { resetScreen } from '../fx/screen'
import { FaceCloud, FaceCrew } from '../tournament/TournamentShowtime'
import { isComplete, standings } from './engine'
import { Leaderboard, money } from './LeagueDashboard'
import type { League } from './types'

/** Tournament mode's champion ceremony, for one (or a tied few) instead of a team. */
export function LeagueCeremony({ league, onDone }: { league: League; onDone: () => void }) {
  const reduced = useReducedMotion()
  const [lap, setLap] = useState(0)
  const rows = standings(league)
  const champions = rows.filter((r) => r.place === 1)
  const runnersUp = rows.filter((r) => r.place > 1 && r.payout > 0)
  const lastPlace = rows[rows.length - 1].place
  const spoons = rows.filter((r) => r.place === lastPlace && r.place > 1)
  const done = isComplete(league)

  useEffect(() => {
    bell(); if (!reduced) spawnConfetti(240)
    const timer = window.setTimeout(airhorn, 650)
    return () => { window.clearTimeout(timer); resetScreen(); clearParticles() }
  }, [reduced])

  return <div className="tn-page tn-ceremony tn-champions lg-ceremony">
    <FaceCloud players={league.players} />
    <span className="tn-eyebrow">{league.name} · {done ? 'THE POT HAS A HOME' : 'STANDINGS SO FAR'}</span>
    <motion.div className="tn-champion-stage" initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 15 }}>
      <span className="tn-sticker">{champions.length > 1 ? 'SHARING IS CARING. APPARENTLY.' : 'THIS WILL BE THEIR WHOLE PERSONALITY NOW'}</span>
      <h1>{champions.map((r) => r.player.name).join(' & ')}</h1>
      <p className="tn-final-score"><strong>{champions[0].points} pts</strong> · {champions[0].wins} of {champions[0].played} won</p>
      <div className={`tn-champion-heads lg-crew-${Math.min(champions.length, 5)}`} key={lap}>
        <FaceCrew players={champions.map((r) => r.player)} crowned interactive /></div>
      <p className="tn-champion-caption">{champions.length > 1 ? 'CO-FINAL BOSSES OF THE DISCORD.' : 'ALL HAIL THE DISCORD FINAL BOSS.'}</p>
      <div className="tn-champion-prize"><span>THE SPOILS OF WAR{champions[0].tied ? ' · EACH' : ''}</span><strong>💰 {money(league, champions[0].payout)}</strong></div>
      {runnersUp.length > 0 && <div className="lg-runner-up"><span className="tn-eyebrow">🥈 FIRST LOSER{runnersUp.length > 1 ? 'S' : ''}</span>
        <div className={`lg-crew-${Math.min(runnersUp.length, 5)}`}><FaceCrew players={runnersUp.map((r) => r.player)} color="#c9ced8" /></div>
        <strong>{money(league, runnersUp[0].payout)}{runnersUp[0].tied ? ' each' : ''}</strong></div>}
      {done && spoons.length > 0 && <p className="lg-spoon">🥄 Wooden spoon: <strong>{spoons.map((r) => r.player.name).join(' & ')}</strong> ({spoons[0].points} pts). Thanks for the donation.</p>}
    </motion.div>
    <section className="tn-panel lg-ceremony-board"><Leaderboard league={league} rows={rows} /></section>
    <footer className="tn-actions">
      <button className="tn-button" onClick={() => { initAudio(); airhorn(); if (!reduced) spawnConfetti(180); setLap((n) => n + 1) }}>One more victory lap ↻</button>
      <button className="tn-button gold" onClick={onDone}>Back to league →</button>
    </footer>
  </div>
}
