import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { airhorn, bell, initAudio, stamp } from '../lib/audio'
import { clearParticles, spawnConfetti } from '../fx/particles'
import { resetScreen } from '../fx/screen'
import { tournamentState } from './engine'
import { prizeLabel, sourceLabel } from './TournamentDashboard'
import { FaceCloud, FaceCrew, MatchPoster } from './TournamentShowtime'
import type { Tournament } from './types'

export function TournamentDraw({ tournament: t, onDone }: { tournament: Tournament; onDone: () => void }) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const opening = tournamentState(t).series.filter((s) => s.series.bracket === 'upper' && s.series.round === 1)
  const teams = t.seedOrder.map((id) => t.teams.find((team) => team.id === id)!)
  const total = teams.length + opening.length
  const next = useCallback(() => { initAudio(); if (index + 1 >= total) onDone(); else setIndex(index + 1) }, [index, total, onDone])
  useEffect(() => {
    stamp()
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); onDone() }
      if ((e.code === 'Space' || e.code === 'Enter') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, onDone])
  const match = opening[index - teams.length]
  return <div className="tn-page tn-ceremony">
    <div className="tn-ceremony-top"><span className="tn-eyebrow">{t.name} · THE DRAW</span><button className="tn-button" onClick={onDone}>Skip to bracket</button></div>
    <motion.div className="tn-draw-stage" key={index} initial={reduced ? false : { opacity: 0, scale: .6, rotate: -8, y: 80 }} animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }} transition={{ type: 'spring', stiffness: 210, damping: 14 }}>
      <span className="tn-eyebrow">{index < teams.length ? `MEET THE CONTENDERS · SEED ${index + 1}` : `OPENING MATCH · ${match.series.id}`}</span>
      <h1>{index < teams.length ? teams[index].name : 'OH. IT’S PERSONAL.'}</h1>
      {index < teams.length ? <div className="tn-squad-entrance"><span className="tn-sticker">{['FIVE PLAYERS. ONE SHARED BRAINCELL.', 'THE GROUP CHAT HAS ESCAPED.', 'ABSOLUTELY NO REFUNDS.', 'THEY SAID THEY COULD CARRY.'][index % 4]}</span>
        <FaceCrew players={teams[index].players} color={teams[index].color} interactive />
        <p className="tn-note">Click a head to hype them up. They probably need it.</p></div> : <>
        <MatchPoster teams={match.teams.flatMap((id) => t.teams.filter((team) => team.id === id))} label={match.status === 'bye' ? 'THE OPPONENT DID NOT EXIST' : 'THE OPENING GRUDGE MATCH'} />
        {match.status === 'bye' && <p className="tn-note">Automatic advance. No game played and no win awarded.</p>}</>}
    </motion.div>
    <footer><p className="tn-note">{index + 1} / {total} · SPACE to continue · ESC to skip</p><button className="tn-button gold" onClick={next}>{index + 1 === total ? 'Let the games begin' : 'Reveal next'} →</button></footer>
  </div>
}

export function ChampionCeremony({ tournament: t, onDone }: { tournament: Tournament; onDone: () => void }) {
  const reduced = useReducedMotion()
  const [lap, setLap] = useState(0)
  const state = tournamentState(t)
  const team = t.teams.find((team) => team.id === state.championId)!
  const final = [...state.series].reverse().find((s) => s.status === 'complete')!
  useEffect(() => {
    bell(); if (!reduced) spawnConfetti(240)
    const timer = window.setTimeout(airhorn, 650)
    return () => { window.clearTimeout(timer); resetScreen(); clearParticles() }
  }, [reduced])
  return <div className="tn-page tn-ceremony tn-champions">
    <FaceCloud players={team.players} />
    <span className="tn-eyebrow">{t.name} · THE TITLE HAS A HOME</span>
    <motion.div className="tn-champion-stage" initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 15 }}>
      <span className="tn-sticker">THIS WILL BE THEIR WHOLE PERSONALITY NOW</span><h1>{team.name}</h1>
      <p className="tn-final-score">{sourceLabel(t, final, 0)} <strong>{final.score.join(' : ')}</strong> {sourceLabel(t, final, 1)}</p>
      <div className="tn-champion-heads" key={lap}><FaceCrew players={team.players} color={team.color} crowned interactive /></div>
      <p className="tn-champion-caption">ALL HAIL THE DISCORD FINAL BOSSES.</p>
      {t.prize && <div className="tn-champion-prize"><span>THE SPOILS OF WAR · PRIZE POOL</span><strong>{prizeLabel(t)}</strong></div>}
    </motion.div>
    <footer className="tn-actions"><button className="tn-button" onClick={() => { initAudio(); airhorn(); if (!reduced) spawnConfetti(180); setLap((n) => n + 1) }}>One more victory lap ↻</button>
      <button className="tn-button gold" onClick={onDone}>Back to tournament →</button></footer>
  </div>
}
