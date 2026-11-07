import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'
import { Face } from '../components/Face'
import { RankBadge } from '../components/RankBadge'
import { initAudio, stamp, tick } from '../lib/audio'
import { REQUIRED_PLAYERS } from '../lib/randomize'
import { statsFor } from '../lib/stats'
import { ROSTER } from '../roster'
import { FaceCrew } from '../tournament/TournamentShowtime'
import { createLeague, DEFAULT_SCHEDULE, DEFAULT_WHEEL } from './engine'
import type { LanePolicy, League } from './types'
import { WallpaperPicker } from './WallpaperPicker'

const numbers = (text: string) => text.split(/[\s,;]+/).filter(Boolean).map(Number)
export const LANE_LABEL: Record<LanePolicy, string> = { CHOSEN: 'Teams pick lanes', RANDOM: 'Full random roll' }
export const LANE_EMOJI: Record<LanePolicy, string> = { CHOSEN: '🗳️', RANDOM: '🎲' }

const ALL_RANDOM: LanePolicy[] = DEFAULT_SCHEDULE.map(() => 'RANDOM')

export function LeagueSetup({ initialSelected, onCreate, onCancel }: {
  initialSelected: string[]
  onCreate: (league: League) => void
  onCancel: () => void
}) {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('In House League')
  const [selected, setSelected] = useState(() => initialSelected.filter((id) => ROSTER.some((p) => p.id === id)).slice(0, REQUIRED_PLAYERS))
  const [schedule, setSchedule] = useState<LanePolicy[]>(DEFAULT_SCHEDULE)
  const [wheel, setWheel] = useState(DEFAULT_WHEEL.join(', '))
  const [entryFee, setEntryFee] = useState('150')
  const [currency, setCurrency] = useState('SEK')
  const [payouts, setPayouts] = useState('1200, 300')
  const [error, setError] = useState<string | null>(null)
  const [wallpaper, setWallpaper] = useState<string | null>(null)

  const selectedPlayers = selected.map((id) => ROSTER.find((p) => p.id === id)!)
  const full = selected.length === REQUIRED_PLAYERS
  const pot = Number(entryFee) * selected.length
  const prizeTotal = numbers(payouts).reduce((a, b) => a + b, 0)
  const toggle = (id: string) => {
    initAudio(); tick()
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < REQUIRED_PLAYERS ? [...cur, id] : cur)
  }
  const preset = (s: LanePolicy[]) => { initAudio(); tick(); setSchedule(s) }
  const same = (a: LanePolicy[], b: LanePolicy[]) => a.every((x, i) => x === b[i])

  const create = () => {
    try {
      const league = createLeague({
        id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString(),
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        players: selectedPlayers,
        rules: { schedule, wheel: numbers(wheel), entryFee: Number(entryFee), currency: currency.trim() || 'SEK', payouts: numbers(payouts) },
      })
      onCreate(wallpaper ? { ...league, wallpaper } : league)
    } catch (e) { setError((e as Error).message) }
  }

  return <div className="tn-page tn-setup" key={step}>
    <header className="tn-heading"><div><span className="tn-eyebrow">IN HOUSE / POINTS LEAGUE</span>
      <h1>{['Recruit the ten.', 'Set the stakes.'][step]}</h1>
      <p>{['New teammates every match. Nobody to hide behind.', 'Five matches. One pot. Zero loyalty.'][step]}</p></div>
      <button className="tn-button" onClick={onCancel}>← Leagues</button></header>
    <nav className="tn-setup-steps" aria-label="League setup steps">{['Pick your fighters', 'Set the stakes'].map((label, i) =>
      <button key={label} aria-current={step === i ? 'step' : undefined} disabled={i === 1 && !full}
        onClick={() => { setStep(i); setError(null) }}><span>0{i + 1}</span>{label}</button>)}</nav>

    {step === 0 && <>
      <section className="tn-recruit-stage">
        <div><span className="tn-sticker">{full ? 'THE GANG’S ALL HERE' : 'SOME ASSEMBLY REQUIRED'}</span>
          <h2>{selected.length}<em> / {REQUIRED_PLAYERS}</em></h2><p>PLAYERS CLOCKED IN</p></div>
        {selectedPlayers.length ? <FaceCrew players={selectedPlayers.slice(-5)} />
          : <div className="tn-empty-crew" aria-hidden="true">{['?', '?', '?', '?', '?'].map((v, i) => <span key={i}>{v}</span>)}<b>YOUR QUESTIONABLE ALL-STARS GO HERE ↑</b></div>}
      </section>
      <section className="tn-panel tn-recruit-panel">
        <div className="tn-section-title"><h2>Tap a face. Take their money.</h2><span className="tn-chip">{selected.length} / {REQUIRED_PLAYERS}</span></div>
        <div className="tn-actions"><button className="tn-button" onClick={() => setSelected([])}>Clear selection</button></div>
        <div className="tn-player-grid">{ROSTER.map((p, i) => {
          const on = selected.includes(p.id)
          return <div key={p.id} className={`tn-player-choice ${on ? 'selected' : ''}`}>
            <motion.button type="button" aria-pressed={on} disabled={!on && full}
              whileHover={reduced ? undefined : { rotate: i % 2 ? 3 : -3, y: -5 }} whileTap={reduced ? undefined : { scale: 0.9 }}
              onClick={() => toggle(p.id)}>
              <span className="tn-recruit-check" aria-hidden="true">{on ? 'IN!' : '+'}</span>
              <Face src={p.img} alt="" className="tn-face" /><strong>{p.name}</strong><RankBadge rank={statsFor(p)?.rank} short />
            </motion.button></div>
        })}</div>
      </section>
      <footer className="tn-setup-footer tn-recruit-footer">
        <p>{full ? 'Beautiful. Ten wallets, one pot.' : `Pick exactly ${REQUIRED_PLAYERS}. The rest get to heckle.`}</p>
        <button className="tn-button gold tn-big-button" disabled={!full} onClick={() => { initAudio(); stamp(); setStep(1) }}>Set the stakes →</button>
      </footer>
    </>}

    {step === 1 && <section className="tn-panel tn-rules-panel">
      <div className="tn-section-title"><span className="tn-sticker">THE VIBE CHECK</span><h2>How do lanes work?</h2></div>
      <div className="tn-presets">
        <button className="tn-preset" aria-pressed={same(schedule, DEFAULT_SCHEDULE)} onClick={() => preset(DEFAULT_SCHEDULE)}>
          <span className="tn-preset-doodle" aria-hidden="true">🗳️</span><strong>TONIGHT’S MIX</strong>
          <span>Pick, roll, pick,<br />roll, pick.</span><small>Matches 1·3·5 teams pick lanes · 2·4 full random roll</small></button>
        <button className="tn-preset" aria-pressed={same(schedule, ALL_RANDOM)} onClick={() => preset(ALL_RANDOM)}>
          <span className="tn-preset-doodle" aria-hidden="true">⚄</span><strong>ALL RANDOM</strong>
          <span>Put the lads<br />in a blender.</span><small>Every match is a full random roll, curses included</small></button>
      </div>
      <div className="tn-fields">
        <label className="tn-field tn-wide">League name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <label className="tn-field tn-wide">Wheel segments (points)<input value={wheel} onChange={(e) => setWheel(e.target.value)} inputMode="numeric" /></label>
      </div>
      <details className="tn-house-rules"><summary>Match by match <span>{schedule.map((s) => LANE_EMOJI[s]).join(' ')}</span></summary>
        <div className="lg-schedule">{schedule.map((policy, i) => <div className="lg-schedule-row" key={i}>
          <strong>Match {i + 1}</strong>
          <div className="tn-view-toggle">{(['CHOSEN', 'RANDOM'] as const).map((p) =>
            <button key={p} type="button" className="tn-button" aria-pressed={policy === p}
              onClick={() => setSchedule((s) => s.map((x, k) => k === i ? p : x))}>{LANE_EMOJI[p]} {LANE_LABEL[p]}</button>)}</div>
        </div>)}</div>
      </details>
      <details className="tn-house-rules" open><summary>💰 Entry & prizes <span>pot {pot.toLocaleString('sv-SE')} {currency} · {payouts}</span></summary>
        <div className="tn-fields">
          <label className="tn-field">Entry fee<input value={entryFee} onChange={(e) => setEntryFee(e.target.value)} inputMode="decimal" /></label>
          <label className="tn-field">Currency<input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={6} /></label>
          <label className="tn-field tn-wide">Prizes by place (1st, 2nd, …)<input value={payouts} onChange={(e) => setPayouts(e.target.value)} inputMode="numeric" /></label>
        </div>
        {prizeTotal > pot && <p className="tn-error">The prizes add up to more than the pot.</p>}
      </details>
      <details className="tn-house-rules" open><summary>🖼️ League wallpaper <span>{wallpaper ? 'custom' : 'optional · goes behind every screen'}</span></summary>
        <WallpaperPicker value={wallpaper ?? undefined} onChange={setWallpaper} />
      </details>
      <p className="tn-note">Every match draws two brand-new random teams. Before each one you choose how it pays: spin the wheel, or win prediction from average rank. Players level on points share a place and split the prizes it covers.</p>
      {error && <p className="tn-error" role="alert">{error}</p>}
      <div className="tn-setup-footer"><button className="tn-button" onClick={() => setStep(0)}>← Fighters</button>
        <button className="tn-button gold tn-big-button" onClick={create}>🥊 Let’s go</button></div>
    </section>}
  </div>
}
