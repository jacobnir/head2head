import { useState } from 'react'
import { Face } from '../components/Face'
import { RankBadge } from '../components/RankBadge'
import { LANES } from '../types'
import { predictionStandings, tournamentState } from './engine'
import { FaceCloud, FaceCrew, MatchPoster } from './TournamentShowtime'
import type { Prediction, SeriesState, Tournament, TournamentTeam } from './types'

export function prizeLabel(t: Tournament) {
  return t.prize ? `${t.prize.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t.prize.currency}` : null
}

export function TeamLineup({ team, compact = false }: { team: TournamentTeam; compact?: boolean }) {
  return <article className={`tn-lineup ${compact ? 'compact' : ''}`} style={{ borderTopColor: team.color }}>
    <h3><span className="tn-team-dot" style={{ background: team.color }} />{team.name}</h3>
    <FaceCrew players={team.players} color={team.color} interactive={!compact} />
    {!compact && <div className="tn-lineup-ranks">{team.players.map((p) => <RankBadge key={p.id} rank={p.statsSnapshot?.rank} short />)}</div>}
  </article>
}

export function sourceLabel(t: Tournament, state: SeriesState, side: number) {
  const teamId = state.teams[side]
  if (teamId) return t.teams.find((team) => team.id === teamId)!.name
  if (state.status === 'bye') return 'BYE'
  const source = state.series.sources[side]
  return source.kind === 'seed' ? 'BYE' : `${source.kind === 'winner' ? 'Winner' : 'Loser'} of ${source.seriesId}`
}

function Bracket({ tournament: t, onSelect }: { tournament: Tournament; onSelect: (id: string) => void }) {
  const [view, setView] = useState<'bracket' | 'list'>(t.teams.length > 16 ? 'list' : 'bracket')
  const states = tournamentState(t).series
  const renderMatch = (s: SeriesState) => <button key={s.series.id} className={`tn-bracket-match ${s.status}`} onClick={() => onSelect(s.series.id)}>
    <span className="tn-match-meta"><span>{s.series.id} · BO{s.series.bestOf}</span><span>{s.status === 'bye' ? 'BYE' : s.status === 'skipped' ? 'NOT NEEDED' : s.status.toUpperCase()}</span></span>
    {s.teams.map((id, i) => {
      const team = t.teams.find((team) => team.id === id)
      return <span className={`tn-match-team ${id && id === s.winnerId ? 'winner' : ''}`} key={i}>
        {team && <span className="tn-bracket-heads" aria-hidden="true">{team.players.map((p) => <Face key={p.id} src={p.img} alt="" className="tn-bracket-face" />)}</span>}
        <span className="tn-bracket-team-name"><i className="tn-team-dot" style={{ background: team?.color ?? '#555566' }} />{sourceLabel(t, s, i)}</span>
        <b>{s.status === 'bye' || !id ? '—' : s.score[i]}</b></span>
    })}
  </button>
  return <section className="tn-panel">
    <div className="tn-section-title"><div><span className="tn-eyebrow">THE ROAD TO QUESTIONABLE GLORY</span><h2>The bracket</h2></div><div className="tn-view-toggle">
      <button className="tn-button" aria-pressed={view === 'bracket'} onClick={() => setView('bracket')}>Bracket</button>
      <button className="tn-button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Match list</button></div></div>
    {(['upper', 'lower', 'final'] as const).map((bracket) => {
      const subset = states.filter((s) => s.series.bracket === bracket)
      if (!subset.length) return null
      const rounds = [...new Set(subset.map((s) => s.series.round))]
      return <div key={bracket} className="tn-bracket-section"><h3>{bracket === 'upper' ? (t.rules.format === 'single' ? 'CHAMPIONSHIP BRACKET' : 'UPPER BRACKET') : bracket === 'lower' ? 'LOWER BRACKET · LAST CHANCE' : 'THE TITLE FIGHT'}</h3>
        <div className={view === 'bracket' ? 'tn-bracket-scroll' : 'tn-match-list'} aria-label={`${bracket} bracket`}>
          {rounds.map((round) => <div className="tn-round" key={round}><h4>{subset.find((s) => s.series.round === round)!.series.label}</h4>
            <div className="tn-round-matches">{subset.filter((s) => s.series.round === round).map(renderMatch)}</div></div>)}
        </div></div>
    })}
    <p className="tn-note">Select any match for its lineup, results, and controls. Byes advance automatically and never count as wins or losses.</p>
  </section>
}

function Picks({ tournament: t, onSave }: { tournament: Tournament; onSave: (p: Prediction) => boolean }) {
  const [editing, setEditing] = useState<Prediction | null>(null)
  const states = tournamentState(t).series
  const rows = predictionStandings(t)
  return <section className="tn-panel">
    <div className="tn-section-title"><div><span className="tn-eyebrow">BRAGGING RIGHTS ONLY</span><h2>Pick’ems</h2></div>
      <button className="tn-button gold" onClick={() => setEditing({ id: crypto.randomUUID(), name: '', series: {} })}>+ Add predictor</button></div>
    <p className="tn-note">1 point per correct series · 3 for the champion · ties share a place. Champion picks lock at the opening bell; series picks lock when the first game starts.</p>
    {editing && <form className="tn-pick-form" onSubmit={(e) => { e.preventDefault(); if (onSave(editing)) setEditing(null) }}>
      <div className="tn-fields"><label className="tn-field">Predictor name<input autoFocus value={editing.name} required maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
        <label className="tn-field">Champion {t.startedAt ? '· LOCKED' : ''}<select value={editing.championId ?? ''} disabled={!!t.startedAt} onChange={(e) => setEditing({ ...editing, championId: e.target.value || undefined })}>
          <option value="">No pick</option>{t.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        {states.filter((s) => s.teams.every(Boolean) && !['waiting', 'bye', 'skipped'].includes(s.status)).map((s) => <label className="tn-field" key={s.series.id}>
          {s.series.id} · {s.series.label}{s.series.startedAt ? ' · LOCKED' : ''}
          <select disabled={!!s.series.startedAt} value={editing.series[s.series.id] ?? ''} onChange={(e) => {
            const series = { ...editing.series }
            if (e.target.value) series[s.series.id] = e.target.value
            else delete series[s.series.id]
            setEditing({ ...editing, series })
          }}><option value="">No pick</option>{[...new Set([...s.teams, editing.series[s.series.id]].filter(Boolean))].map((id) => <option key={id} value={id!}>{t.teams.find((team) => team.id === id)?.name}</option>)}</select></label>)}
      </div><div className="tn-actions"><button className="tn-button gold" type="submit">Save picks</button><button className="tn-button" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    {rows.length ? <div className="tn-leaderboard">{rows.map((p) => <div className="tn-leaderboard-row" key={p.id}>
      <strong className="tn-place">{p.position.toString().padStart(2, '0')}</strong><div><strong>{p.name}</strong><p>Champion pick: {t.teams.find((team) => team.id === p.championId)?.name ?? '—'}</p></div>
      <strong>{p.points} <small>PTS</small></strong><button className="tn-button" onClick={() => setEditing({ ...p, series: { ...p.series } })}>Edit picks</button>
    </div>)}</div> : <div className="tn-empty">Who’s got the script? Add your first predictor.</div>}
  </section>
}

type DashboardProps = {
  tournament: Tournament
  onBack: () => void
  onEdit: () => void
  onStart: () => void
  onDraw: () => void
  onChampions: () => void
  onExport: () => void
  onSavePrediction: (prediction: Prediction) => boolean
  onStartGame: (id: string, roles?: { blue: string[]; red: string[] }) => void
  onViewGame: (id: string, index: number, reveal?: boolean) => void
  onWinner: (id: string, gameId: string, winnerId: string) => void
  onUndo: (id: string) => void
}

function SeriesPanel({ tournament: t, state: s, onBack, onStartGame, onViewGame, onWinner, onUndo }: Pick<DashboardProps,
  'tournament' | 'onStartGame' | 'onViewGame' | 'onWinner' | 'onUndo'> & { state: SeriesState; onBack: () => void }) {
  const nextIndex = s.series.games.length
  const blueTeam = t.teams.find((team) => team.id === s.teams[nextIndex % 2])
  const redTeam = t.teams.find((team) => team.id === s.teams[1 - nextIndex % 2])
  const [chosen, setChosen] = useState<{ blue: string[]; red: string[] }>(() => ({ blue: blueTeam?.players.map((p) => p.id) ?? [], red: redTeam?.players.map((p) => p.id) ?? [] }))
  const active = s.series.games.find((g) => !g.winnerId)
  const ready = t.startedAt && ['ready', 'playing'].includes(s.status) && !active
  const changeRole = (side: 'blue' | 'red', index: number, id: string) => {
    const order = [...chosen[side]]
    const other = order.indexOf(id)
    ;[order[index], order[other]] = [order[other], order[index]]
    setChosen({ ...chosen, [side]: order })
  }
  return <>
    <button className="tn-button" onClick={onBack}>← Bracket</button>
    <section className="tn-series-hero"><span className="tn-eyebrow">{s.series.id} · {s.series.label} · BEST OF {s.series.bestOf}</span>
      <h1>{sourceLabel(t, s, 0)} <em>{s.score[0]} : {s.score[1]}</em> {sourceLabel(t, s, 1)}</h1>
      <div className="tn-actions">{s.series.bracket === 'lower' || t.rules.format === 'single' || s.series.reset ? <span className="tn-chip red">ELIMINATION MATCH</span> : null}
        {s.status !== 'complete' && s.score.some((n) => n === Math.floor(s.series.bestOf / 2)) && s.status !== 'bye' && <span className="tn-chip">MATCH POINT</span>}
        {s.winnerId && <span className="tn-chip">{t.teams.find((team) => team.id === s.winnerId)?.name} {s.status === 'bye' ? 'ADVANCES WITH A BYE' : 'WINS'}</span>}</div>
    </section>
    <MatchPoster teams={s.teams.flatMap((id) => t.teams.filter((team) => team.id === id))} label={s.series.bracket === 'lower' ? 'LOSE HERE. BECOME A SPECTATOR.' : 'TEN FRIENDS ENTER. FIVE FRIENDS COPE.'} score={s.score.join(' : ')} />
    {active && <section className="tn-panel tn-next"><span className="tn-eyebrow">GAME {nextIndex} IN PROGRESS</span><h2>Settle it on the Rift.</h2>
      <p>Roles and sides are saved. Return to the fight card or record the result below.</p><div className="tn-actions">
        <button className="tn-button gold" onClick={() => onViewGame(s.series.id, nextIndex - 1)}>Open fight card</button>
        <button className="tn-button" onClick={() => onViewGame(s.series.id, nextIndex - 1, true)}>Replay reveal</button></div></section>}
    {ready && blueTeam && redTeam && <section className="tn-panel">
      <div className="tn-section-title"><h2>Game {nextIndex + 1}</h2><span className="tn-chip">{t.rules.roles === 'random' ? 'RANDOM ROLES' : 'CHOSEN ROLES'}</span></div>
      <p className="tn-note">Blue: {blueTeam.name} · Red: {redTeam.name}. Sides alternate each game. Starting saves the assignments and locks this series’ predictions.</p>
      {t.rules.roles === 'chosen' && <div className="tn-team-grid">{(['blue', 'red'] as const).map((side) => {
        const team = side === 'blue' ? blueTeam : redTeam
        return <div key={side}><h3>{team.name} · {side.toUpperCase()}</h3>{LANES.map((lane, i) => <label className="tn-lineup-slot" key={lane}><span>{lane}</span>
          <select aria-label={`${side} ${lane}`} value={chosen[side][i]} onChange={(e) => changeRole(side, i, e.target.value)}>
            {team.players.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>)}</div>
      })}</div>}
      <button className="tn-button gold" onClick={() => onStartGame(s.series.id, chosen)}>Start game {nextIndex + 1} & reveal →</button>
    </section>}
    {!t.startedAt && <p className="tn-note">Start the tournament from the dashboard to play this match.</p>}
    {s.status === 'waiting' && <p className="tn-note">Waiting for earlier results{s.series.reset ? '. The reset is only played if the lower-bracket finalist wins the first grand final' : ''}.</p>}
    {s.status === 'skipped' && <p className="tn-note">The upper-bracket finalist won the title. No reset needed.</p>}
    {s.series.games.length > 0 && <section className="tn-panel"><h2>Game record</h2><p className="tn-note">To correct an earlier game, undo later games first. Predictions remain locked after an undo.</p>
      {s.series.games.map((game, i) => <div className="tn-game-record" key={game.id}><div><strong>GAME {i + 1}</strong><p>{game.winnerId ? `${t.teams.find((team) => team.id === game.winnerId)?.name} won` : 'Awaiting result'}</p></div>
        <button className="tn-button" onClick={() => onViewGame(s.series.id, i)}>Fight card</button>
        {i === nextIndex - 1 && <><div className="tn-actions">{s.teams.map((id) => <button className="tn-button" key={id} onClick={() => onWinner(s.series.id, game.id, id!)}>{t.teams.find((team) => team.id === id)?.name} wins</button>)}</div>
          <button className="tn-button danger" onClick={() => onUndo(s.series.id)}>Undo game</button></>}
      </div>)}
    </section>}
  </>
}

export function TournamentDashboard(props: DashboardProps) {
  const { tournament: t } = props
  const [tab, setTab] = useState<'bracket' | 'teams' | 'picks'>('bracket')
  const [selected, setSelected] = useState<string | null>(null)
  const state = tournamentState(t)
  const next = state.series.find((s) => s.series.games.some((g) => !g.winnerId)) ?? state.series.find((s) => s.status === 'playing' || s.status === 'ready')
  const current = state.series.find((s) => s.series.id === selected)
  const completed = state.series.filter((s) => s.status === 'complete').length
  if (current) return <div className="tn-page"><SeriesPanel key={`${current.series.id}-${current.series.games.length}`} {...props} state={current} onBack={() => setSelected(null)} /></div>
  return <div className="tn-page">
    <header className="tn-heading"><div><span className="tn-eyebrow">IN HOUSE / TOURNAMENT MODE</span><h1>{t.name}</h1>
      <p>{t.teams.length} teams · {t.rules.format === 'single' ? 'Single' : 'Double'} elimination · {t.rules.roles === 'random' ? 'Random' : 'Chosen'} roles · {t.startedAt ? 'Teams locked' : 'Draft · enter your picks'}</p></div>
      <div className="tn-actions"><button className="tn-button" onClick={props.onBack}>← Events</button><button className="tn-button" onClick={props.onExport}>Export</button></div></header>
    <div className="tn-event-bar"><div><span>CONTENDERS</span><strong>{t.teams.length * 5}</strong></div><div><span>SERIES COMPLETE</span><strong>{completed}</strong></div>
      <div><span>FINAL</span><strong>BO{t.rules.finalBestOf}</strong></div>{t.prize && <div className="tn-prize"><span>PRIZE POOL</span><strong>{prizeLabel(t)}</strong></div>}</div>
    {!t.startedAt ? <section className="tn-panel tn-next tn-draft-party"><FaceCloud players={t.teams.flatMap((team) => team.players)} /><div className="tn-party-copy"><span className="tn-sticker">THE LADS HAVE ARRIVED</span><h2>Everybody’s a problem.<br /><em>Someone gets a trophy.</em></h2>
      <p>Review the squads. Make your picks. Ring the bell.</p><div className="tn-actions">
        <button className="tn-button gold" onClick={props.onStart}>Lock teams & start tournament →</button><button className="tn-button" onClick={props.onEdit}>Edit setup</button>
        <button className="tn-button" onClick={() => setTab('picks')}>Enter predictions</button></div></div></section>
      : state.championId ? <section className="tn-panel tn-next champion tn-winner-banner"><div><span className="tn-sticker">INSUFFERABLE UNTIL NEXT TIME</span>
        <h2>{t.teams.find((team) => team.id === state.championId)?.name}</h2><div className="tn-actions"><button className="tn-button gold" onClick={props.onChampions}>Crown the champions →</button></div></div>
        <FaceCrew players={t.teams.find((team) => team.id === state.championId)!.players} crowned interactive /></section>
        : next ? <section className="tn-next tn-next-poster">
          <MatchPoster teams={next.teams.flatMap((id) => t.teams.filter((team) => team.id === id))} label={`NEXT FIGHT · ${next.series.label} · BO${next.series.bestOf}`} />
          <div className="tn-actions">
            <button className="tn-button gold" onClick={() => setSelected(next.series.id)}>{next.series.games.some((g) => !g.winnerId) ? 'Resume match' : 'Prepare match'} →</button>
            <button className="tn-button" onClick={props.onDraw}>Replay opening draw</button></div></section> : null}
    <nav className="tn-tabs" aria-label="Tournament sections">{(['bracket', 'teams', 'picks'] as const).map((id) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{id === 'picks' ? 'PICK’EMS' : id.toUpperCase()}</button>)}</nav>
    {tab === 'bracket' && <Bracket tournament={t} onSelect={setSelected} />}
    {tab === 'teams' && <div className="tn-team-grid">{t.teams.map((team) => <div key={team.id}><TeamLineup team={team} />
      <p className="tn-team-standing">{state.losses[team.id]} {state.losses[team.id] === 1 ? 'loss' : 'losses'} · {state.championId === team.id ? 'CHAMPION' : state.losses[team.id] >= (t.rules.format === 'single' ? 1 : 2) ? 'ELIMINATED' : 'IN THE HUNT'}</p></div>)}</div>}
    {tab === 'picks' && <Picks tournament={t} onSave={props.onSavePrediction} />}
  </div>
}
