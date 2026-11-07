import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Face } from '../components/Face'
import { RankBadge } from '../components/RankBadge'
import { rankScore, statsFor, describeScore } from '../lib/stats'
import { ROSTER } from '../roster'
import { LANES } from '../types'
import { createTournament, formTeams } from './engine'
import { initAudio, stamp, tick } from '../lib/audio'
import { FaceCrew } from './TournamentShowtime'
import type { BestOf, Tournament, TournamentPlayer, TournamentRules, TournamentTeam } from './types'

const COLORS = ['#4ea6ff', '#ff6a5e', '#bd8bfa', '#5cdbac', '#ffce56', '#ff86bb', '#5bd7df', '#a7c86a']
const TEAM_NAMES = ['Blue Corner', 'Red Corner', 'Purple Reign', 'The Underdogs']
export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]
const playerSnapshot = (p: TournamentPlayer): TournamentPlayer => {
  const stats = statsFor(p)
  return { ...p, statsSnapshot: stats ?? null, ...(stats?.rank ? { strength: rankScore(stats.rank) } : {}) }
}

export function TournamentSetup({ initial, onSave, onCancel }: {
  initial?: Tournament; onSave: (event: Tournament) => void; onCancel: () => void
}) {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(initial ? 2 : 0)
  const [name, setName] = useState(initial?.name ?? 'In House Championship')
  const [countText, setCountText] = useState(String(initial?.teams.length ?? 4))
  const [rules, setRules] = useState<TournamentRules>(initial?.rules ?? {
    format: 'single', formation: 'manual', roles: 'chosen', roundsBestOf: 1, finalBestOf: 3,
  })
  const [players] = useState(() => {
    const prior = initial?.teams.flatMap((t) => t.players) ?? []
    return [...prior, ...ROSTER.filter((p) => !prior.some((old) => old.id === p.id)).map(playerSnapshot)]
  })
  const [selected, setSelected] = useState<string[]>(initial?.teams.flatMap((t) => t.players.map((p) => p.id)) ?? [])
  const [estimates, setEstimates] = useState<Record<string, string>>(() => Object.fromEntries(
    players.filter((p) => !p.statsSnapshot?.rank && p.strength !== undefined).map((p) => [p.id, String(p.strength)])))
  const [teams, setTeams] = useState<TournamentTeam[]>(initial?.teams ?? [])
  const [prize, setPrize] = useState(initial?.prize ? String(initial.prize.amount) : '')
  const [currency, setCurrency] = useState(initial?.prize?.currency ?? 'SEK')
  const [error, setError] = useState('')
  const count = Number(countText)
  const validCount = Number.isSafeInteger(count) && count >= 2
  const needed = validCount ? count * 5 : 0
  const selectedPlayers = selected.map((id) => {
    const p = players.find((p) => p.id === id)!
    return { ...p, strength: p.statsSnapshot?.rank ? p.strength : estimates[id] ? Number(estimates[id]) : undefined }
  })
  const selectedKey = [...selected].sort().join('|')
  const assignedKey = teams.flatMap((t) => t.players.map((p) => p.id)).sort().join('|')
  const formationKey = JSON.stringify({ method: rules.formation, estimates: rules.formation === 'balanced'
    ? selectedPlayers.map((p) => [p.id, p.strength]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) : null })
  const [formedWith, setFormedWith] = useState(initial ? formationKey : '')
  const assembled = validCount && teams.length === count && selected.length === needed && assignedKey === selectedKey && formedWith === formationKey

  const generate = () => {
    try {
      if (!validCount) throw new Error('Choose a whole number of teams, at least two.')
      if (selectedPlayers.length !== needed) throw new Error(`Select exactly ${needed} players first.`)
      const grouped = rules.formation === 'manual'
        ? Array.from({ length: count }, (_, i) => selectedPlayers.slice(i * 5, i * 5 + 5))
        : formTeams(selectedPlayers, count, rules.formation, newSeed())
      setTeams(grouped.map((group, i) => ({ id: `team-${i + 1}`, name: teams[i]?.name ?? TEAM_NAMES[i] ?? `Team ${i + 1}`,
        color: teams[i]?.color ?? COLORS[i % COLORS.length], players: group })))
      setFormedWith(formationKey)
      setError('')
      initAudio(); stamp(); setStep(2)
    } catch (e) { setError((e as Error).message) }
  }

  // Selecting an occupied slot swaps players, so an adjustment never duplicates or drops anyone.
  const swapPlayer = (teamIndex: number, laneIndex: number, playerId: string) => {
    const next = teams.map((t) => ({ ...t, players: [...t.players] }))
    const otherTeam = next.findIndex((t) => t.players.some((p) => p.id === playerId))
    const otherLane = next[otherTeam].players.findIndex((p) => p.id === playerId)
    const old = next[teamIndex].players[laneIndex]
    next[teamIndex].players[laneIndex] = next[otherTeam].players[otherLane]
    next[otherTeam].players[otherLane] = old
    setTeams(next)
  }

  const submit = () => {
    try {
      if (!assembled) throw new Error('Build teams from the selected players first.')
      const event = createTournament({ id: initial?.id ?? crypto.randomUUID(), name: name.trim(), teams,
        rules, seed: newSeed(), createdAt: initial?.createdAt ?? new Date().toISOString(),
        ...(prize.trim() ? { prize: { amount: Number(prize), currency: currency.trim().toUpperCase() } } : {}),
      })
      onSave(event)
    } catch (e) { setError((e as Error).message) }
  }

  return <div className="tn-page tn-setup" key={step}>
    <header className="tn-heading"><div><span className="tn-eyebrow">IN HOUSE / ASSEMBLE THE CIRCUS</span><h1>{['Recruit the problems.', 'How chaotic are we?', 'Meet your bad decisions.'][step]}</h1>
      <p>{['Five players per team. Zero guarantees.', 'Serious bracket. Deeply unserious people.', 'Fixed teammates. Unlimited blame.'][step]}</p></div>
      <button className="tn-button" onClick={onCancel}>← Events</button></header>
    <nav className="tn-setup-steps" aria-label="Tournament setup steps">{['Pick your fighters', 'Set the chaos', 'Squad inspection'].map((label, i) => <button key={label}
      aria-current={step === i ? 'step' : undefined} disabled={i === 2 && !teams.length} onClick={() => { setStep(i); setError('') }}>
      <span>0{i + 1}</span>{label}</button>)}</nav>
    {step === 1 && <section className="tn-panel tn-rules-panel">
      <div className="tn-section-title"><span className="tn-sticker">THE VIBE CHECK</span><h2>Choose your flavour of disaster</h2></div>
      <div className="tn-presets">
        <button className="tn-preset" aria-pressed={rules.formation === 'manual' && rules.roles === 'chosen'} onClick={() => { initAudio(); tick(); setRules({ ...rules, formation: 'manual', roles: 'chosen' }) }}>
          <span className="tn-preset-doodle" aria-hidden="true">♜</span><strong>COMPETITIVE</strong><span>We have a strategy.<br />Allegedly.</span><small>Manual teams · chosen roles</small></button>
        <button className="tn-preset" aria-pressed={rules.formation === 'random' && rules.roles === 'random'} onClick={() => { initAudio(); tick(); setRules({ ...rules, formation: 'random', roles: 'random' }) }}>
          <span className="tn-preset-doodle" aria-hidden="true">⚄</span><strong>ALL RANDOM</strong><span>Put the lads<br />in a blender.</span><small>Random teams · random roles</small></button>
      </div>
      <div className="tn-fields">
        <label className="tn-field tn-wide">Event name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
        <label className="tn-field">Bracket<select value={rules.format} onChange={(e) => setRules({ ...rules, format: e.target.value as TournamentRules['format'] })}>
          <option value="single">Single elimination</option><option value="double">Double elimination</option></select></label>
      </div>
      <details className="tn-house-rules"><summary>House rules & prize pool <span>BO{rules.roundsBestOf} rounds · BO{rules.finalBestOf} final{prize ? ` · ${prize} ${currency}` : ''}</span></summary><div className="tn-fields">
        <label className="tn-field">Team formation<select value={rules.formation} onChange={(e) => setRules({ ...rules, formation: e.target.value as TournamentRules['formation'] })}>
          <option value="manual">Manual</option><option value="random">Random draw</option><option value="balanced">Rank balanced</option></select></label>
        <label className="tn-field">Roles<select value={rules.roles} onChange={(e) => setRules({ ...rules, roles: e.target.value as TournamentRules['roles'] })}>
          <option value="chosen">Chosen before each game</option><option value="random">Random every game</option></select></label>
        {(['roundsBestOf', 'finalBestOf'] as const).map((key) => <label className="tn-field" key={key}>{key === 'roundsBestOf' ? 'Ordinary rounds' : 'Championship final'}
          <select value={rules[key]} onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) as BestOf })}>
            {[1, 3, 5].map((n) => <option value={n} key={n}>Best of {n}</option>)}</select></label>)}
        <label className="tn-field">Prize pool · optional<input type="number" min="0" step="0.01" placeholder="No prize pool" value={prize} onChange={(e) => setPrize(e.target.value)} /></label>
        <label className="tn-field">Currency<input value={currency} maxLength={12} onChange={(e) => setCurrency(e.target.value)} /></label>
      </div>
      </details>
      <p className="tn-note">Teams stay together throughout the event. Champions are chosen in League. No curses in tournament games.
        {rules.format === 'double' && ' Double elimination includes a final reset if the lower-bracket finalist wins.'}</p>
      {rules.formation === 'balanced' && <><p className="tn-note">Descending ranks, snake distribution. Unranked players need a host estimate for balancing only.</p>
        <div className="tn-fields">{selectedPlayers.filter((p) => !p.statsSnapshot?.rank).map((p) => <label className="tn-field" key={p.id}>Balance estimate for {p.name}
          <select value={estimates[p.id] ?? ''} onChange={(e) => setEstimates({ ...estimates, [p.id]: e.target.value })}>
            <option value="">Choose strength</option>{Array.from({ length: 28 }, (_, i) => <option value={i} key={i}>{describeScore(i)}</option>)}
            <option value={28}>Master</option><option value={30}>Grandmaster</option><option value={32}>Challenger</option></select></label>)}</div></>}
      <div className="tn-setup-footer"><button className="tn-button" onClick={() => setStep(0)}>← Fighters</button><button className="tn-button gold tn-big-button" onClick={generate}>{teams.length ? 'Rebuild teams' : 'Build teams'} →</button></div>
    </section>}
    {step === 0 && <>
    <section className="tn-recruit-stage">
      <div><span className="tn-sticker">{selected.length === needed && needed ? 'THE GANG’S ALL HERE' : 'SOME ASSEMBLY REQUIRED'}</span>
        <h2>{selected.length}<em> / {needed || '—'}</em></h2><p>PLAYERS CLOCKED IN</p>
        <label className="tn-field tn-team-count">How many teams?<input type="number" min="2" step="1" value={countText} onChange={(e) => setCountText(e.target.value)} /></label></div>
      {selectedPlayers.length ? <FaceCrew players={selectedPlayers.slice(-5)} /> : <div className="tn-empty-crew" aria-hidden="true">{['?', '?', '?', '?', '?'].map((v, i) => <span key={i}>{v}</span>)}<b>YOUR QUESTIONABLE ALL-STARS GO HERE ↑</b></div>}
    </section>
    <section className="tn-panel tn-recruit-panel">
      <div className="tn-section-title"><h2>Tap a face. Recruit a problem.</h2><span className="tn-chip">{selected.length} / {needed || '—'}</span></div>
      <p className="tn-note">{players.length} available players. Add more through the In House roster. Unselected players sit out.</p>
      <div className="tn-actions"><button className="tn-button" disabled={!validCount || needed > players.length} onClick={() => setSelected(players.slice(0, needed).map((p) => p.id))}>Select first {needed || '—'}</button>
        <button className="tn-button" onClick={() => setSelected([])}>Clear selection</button></div>
      <div className="tn-player-grid">{players.map((p, i) => <div key={p.id} className={`tn-player-choice ${selected.includes(p.id) ? 'selected' : ''}`}>
        <motion.button aria-pressed={selected.includes(p.id)} whileHover={reduced ? undefined : { rotate: i % 2 ? 3 : -3, y: -5 }} whileTap={reduced ? undefined : { scale: .9 }} onClick={() => { initAudio(); tick(); setSelected((cur) => cur.includes(p.id) ? cur.filter((id) => id !== p.id) : [...cur, p.id]) }}>
          <span className="tn-recruit-check" aria-hidden="true">{selected.includes(p.id) ? 'IN!' : '+'}</span><Face src={p.img} alt="" className="tn-face" /><strong>{p.name}</strong><RankBadge rank={p.statsSnapshot?.rank} short /></motion.button>
        {rules.formation === 'balanced' && selected.includes(p.id) && !p.statsSnapshot?.rank && <label className="tn-field tn-estimate">Balance estimate
          <select aria-label={`Balance estimate for ${p.name}`} value={estimates[p.id] ?? ''} onChange={(e) => setEstimates({ ...estimates, [p.id]: e.target.value })}>
            <option value="">Choose strength</option>{Array.from({ length: 28 }, (_, i) => <option value={i} key={i}>{describeScore(i)}</option>)}
            <option value={28}>Master</option><option value={30}>Grandmaster</option><option value={32}>Challenger</option></select></label>}
      </div>)}</div>
    </section><footer className="tn-setup-footer tn-recruit-footer"><p>{selected.length === needed ? 'Beautiful. A disaster waiting to happen.' : `Pick exactly ${needed || 'enough'} players. The rest get to heckle.`}</p>
      <button className="tn-button gold tn-big-button" disabled={!validCount || selected.length !== needed} onClick={() => setStep(1)}>Set the chaos →</button></footer></>}
    {step === 2 && teams.length > 0 && <section className="tn-panel">
      <div className="tn-section-title"><span className="tn-sticker">NO REFUNDS</span><h2>Make it personal</h2></div>
      <p className="tn-note">Name your teams and adjust lineups. Choosing an occupied player swaps the two slots. Slot order supplies the default roles.</p>
      {!assembled && <p className="tn-error">Players or formation settings changed. Rebuild teams before saving.</p>}
      <div className="tn-team-grid">{teams.map((team, ti) => <article className="tn-team-edit" style={{ borderTopColor: team.color }} key={team.id}>
        <FaceCrew players={team.players} color={team.color} />
        <div className="tn-team-inputs"><input type="color" aria-label={`Colour for team ${ti + 1}`} value={team.color} onChange={(e) => setTeams(teams.map((t, i) => i === ti ? { ...t, color: e.target.value } : t))} />
          <input aria-label={`Name for team ${ti + 1}`} value={team.name} maxLength={40} onChange={(e) => setTeams(teams.map((t, i) => i === ti ? { ...t, name: e.target.value } : t))} /></div>
        <details className="tn-house-rules"><summary>Swap fighters & default roles</summary>{team.players.map((p, pi) => <label className="tn-lineup-slot" key={pi}><span>{LANES[pi]}</span><Face src={p.img} alt="" className="tn-small-face" />
          <select aria-label={`${team.name} ${LANES[pi]}`} value={p.id} onChange={(e) => swapPlayer(ti, pi, e.target.value)}>
            {teams.flatMap((t) => t.players).map((available) => <option key={available.id} value={available.id}>{available.name}</option>)}</select></label>)}</details>
      </article>)}</div>
    </section>}
    {error && <p className="tn-error" role="alert">{error}</p>}
    {step === 2 && <footer className="tn-setup-footer"><button className="tn-button" onClick={() => setStep(1)}>← Rules & rebuild</button><p>Save a draft to enter predictions before the opening bell.</p>
      <button className="tn-button gold tn-big-button" disabled={!assembled} onClick={submit}>Save tournament draft →</button></footer>}
  </div>
}
