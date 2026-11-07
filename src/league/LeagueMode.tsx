import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { initAudio } from '../lib/audio'
import { clearParticles } from '../fx/particles'
import { resetScreen } from '../fx/screen'
import { RevealScreen } from '../screens/RevealScreen'
import { ScoreboardScreen } from '../screens/ScoreboardScreen'
import { ShuffleScreen } from '../screens/ShuffleScreen'
import type { Team } from '../types'
import { assignLanes, currentMatch, drawTeams, isComplete, phaseOf, recordWinner, spinWheel, standings, startMatch, undo } from './engine'
import { LanePicker } from './LanePicker'
import { LeagueCeremony } from './LeagueCeremony'
import { LeagueDashboard, money, stakeLabel } from './LeagueDashboard'
import { LANE_LABEL, LeagueSetup } from './LeagueSetup'
import { readLeagues, writeLeagues } from './storage'
import type { League, LeagueMatch, PointsMode } from './types'
import { Wheel } from './Wheel'
import { FaceCloud } from '../tournament/TournamentShowtime'
import { ROSTER } from '../roster'
import '../styles/tournament.css'
import '../styles/tournament-party.css'
import '../styles/league.css'

/**
 * Optional backdrop: drop an image at public/league-wallpaper.{jpg,png,webp}. Probed once
 * rather than hard-wired, so a missing file just means the normal background.
 */
const WALLPAPERS = ['/league-wallpaper.jpg', '/league-wallpaper.png', '/league-wallpaper.webp']
function useWallpaper() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const tryNext = (i: number) => {
      if (i >= WALLPAPERS.length) return
      const img = new Image()
      img.onload = () => { if (alive) setUrl(WALLPAPERS[i]) }
      img.onerror = () => tryNext(i + 1)
      img.src = WALLPAPERS[i]
    }
    tryNext(0)
    return () => { alive = false }
  }, [])
  return url
}

/** What the room says when the wheel stops. */
function wheelQuip(value: number, wheel: number[]) {
  if (value === Math.max(...wheel)) return '🤑 JACKPOT. Try-hards, assemble.'
  if (value === Math.min(...wheel)) return '🥱 Participation points. Play for fun, apparently.'
  return value > (Math.max(...wheel) + Math.min(...wheel)) / 2 ? '😤 Now it matters.' : '🤷 Could be worse. Could be better.'
}

type View = 'home' | 'setup' | 'dashboard' | 'wheel' | 'shuffle' | 'lanes' | 'reveal' | 'card' | 'final'
type Confirmation = { title: string; description: string; label: string; action: () => void }

function ConfirmAction({ confirmation, onClose }: { confirmation: Confirmation; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog className="tn-confirm" ref={dialog} aria-labelledby="lg-confirm-title" onCancel={(e) => { e.preventDefault(); onClose() }}>
    <span className="tn-eyebrow">HOST CONTROL</span><h2 id="lg-confirm-title">{confirmation.title}</h2><p>{confirmation.description}</p>
    <div className="tn-actions"><button className="tn-button" onClick={onClose}>Cancel</button><button className="tn-button gold" onClick={() => { onClose(); confirmation.action() }}>{confirmation.label}</button></div>
  </dialog>
}

function load() {
  try { return readLeagues(window.localStorage) }
  catch { return { leagues: [], error: 'This browser cannot access local storage.' } }
}

const matchContext = (league: League, m: LeagueMatch) =>
  `${league.name} · Match ${m.index + 1} of ${league.rules.schedule.length} · ${LANE_LABEL[m.lanes]} · ${stakeLabel(m)}`

export default function LeagueMode({ initialSelected, onExit }: { initialSelected: string[]; onExit: () => void }) {
  const [loaded, setLoaded] = useState(load)
  const [view, setView] = useState<View>('home')
  const [leagueId, setLeagueId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [spinning, setSpinning] = useState(false)
  const sharedWallpaper = useWallpaper()
  const league = loaded.leagues.find((l) => l.id === leagueId)
  const match = league ? currentMatch(league) : undefined
  // Inside a league its own upload wins; everywhere else, the shared file (if any).
  const wallpaper = (view !== 'home' && view !== 'setup' && league?.wallpaper) || sharedWallpaper
  const navigate = (next: View) => { resetScreen(); clearParticles(); setError(null); setView(next) }

  const persist = (leagues: League[]) => {
    writeLeagues(window.localStorage, leagues)
    setLoaded({ leagues, error: null })
  }
  const update = (operation: (l: League) => League): League | null => {
    try {
      if (!league) throw new Error('Open a league first.')
      const next = operation(league)
      persist(loaded.leagues.map((l) => l.id === next.id ? next : l))
      return next
    } catch (e) { setError((e as Error).message); return null }
  }

  // ShuffleScreen restarts its timer whenever onDone changes, so hand it a stable callback.
  const afterShuffle = useRef<() => void>(() => {})
  afterShuffle.current = () => navigate(match?.lanes === 'CHOSEN' ? 'lanes' : 'reveal')
  const onShuffled = useCallback(() => afterShuffle.current(), [])

  const draw = () => { if (update(drawTeams)) { initAudio(); navigate('shuffle') } }
  const choose = (points: PointsMode) => {
    initAudio()
    const next = update((l) => {
      const started = startMatch(l, new Date().toISOString(), points)
      return points === 'RANK' ? drawTeams(started) : started
    })
    if (next) navigate(points === 'WHEEL' ? 'wheel' : 'shuffle')
  }
  const spin = () => { initAudio(); if (update(spinWheel)) setSpinning(true) }
  const winner = (side: Team) => {
    if (!league || !match?.stake) return
    setConfirmation({ title: `${side === 'BLUE' ? 'Blue' : 'Red'} side wins?`, label: 'Confirm result',
      description: `Each of the five ${side.toLowerCase()} players gets +${match.stake[side]} points. You can undo this from the league page.`,
      action: () => { const next = update((l) => recordWinner(l, side)); if (next) navigate(isComplete(next) ? 'final' : 'dashboard') } })
  }

  let content
  if (view === 'setup') content = <LeagueSetup initialSelected={initialSelected} onCancel={() => navigate('home')}
    onCreate={(created) => { try { persist([...loaded.leagues, created]); setLeagueId(created.id); navigate('dashboard') } catch (e) { setError((e as Error).message) } }} />
  else if (league && match && view === 'wheel') {
    const landed = match.wheel?.index
    content = <div className="tn-page lg-wheel-page">
      <span className="tn-eyebrow">{matchContext(league, match).toUpperCase()}</span>
      <h1>{landed === undefined ? 'Spin for points 🎡' : spinning ? 'Round and round…' : <>Winners get <em>{match.wheel!.value}</em> pts</>}</h1>
      <span className={`tn-sticker lg-quip ${landed !== undefined && !spinning ? 'show' : ''}`}>
        {landed === undefined || spinning ? 'NO TAKE-BACKS' : wheelQuip(match.wheel!.value, league.rules.wheel)}</span>
      <Wheel segments={league.rules.wheel} landed={landed} seed={match.seed} animateSpin={spinning} onLanded={() => setSpinning(false)} />
      <div className="tn-actions">
        {landed === undefined ? <button className="tn-button gold lg-big" onClick={spin}>🎡 SPIN</button>
          : <button className="tn-button gold lg-big" disabled={spinning} onClick={draw}>🎲 Draw teams →</button>}
        <button className="tn-button" disabled={spinning} onClick={() => navigate('dashboard')}>← League</button>
      </div>
    </div>
  }
  else if (league && view === 'shuffle') content = <ShuffleScreen players={league.players} onDone={onShuffled} />
  else if (league && match?.blue && view === 'lanes') content = <LanePicker key={match.index} league={league} match={match} onBack={() => navigate('dashboard')}
    onConfirm={(blue, red) => { if (update((l) => assignLanes(l, blue, red))) navigate('reveal') }} />
  else if (league && match?.result && view === 'reveal') content = <RevealScreen result={match.result} contextLabel={matchContext(league, match)} onDone={() => navigate('card')} />
  else if (league && match?.result && match.stake && view === 'card') content = <ScoreboardScreen result={match.result}
    title={`MATCH ${match.index + 1} FIGHT CARD`} onBack={() => navigate('dashboard')} subtitle={matchContext(league, match)}
    blueLabel={`BLUE · +${match.stake.BLUE} PTS`} redLabel={`RED · +${match.stake.RED} PTS`}
    footer={<>
      <button className="btn ghost" onClick={() => navigate('dashboard')}>← League</button>
      <button className="btn ghost" onClick={() => navigate('reveal')}>Replay reveal</button>
      {match.winner ? <span className="tn-chip">WINNER: {match.winner}</span>
        : (['BLUE', 'RED'] as const).map((side) => <button key={side} className="btn primary" onClick={() => winner(side)}>{side} wins (+{match.stake![side]})</button>)}
    </>} />
  else if (league && view === 'final') {
    content = <LeagueCeremony league={league} onDone={() => navigate('dashboard')} />
  }
  else if (league && view !== 'home') content = <LeagueDashboard league={league} onBack={() => navigate('home')}
    onChoose={choose} onSpin={() => navigate('wheel')} onDraw={draw}
    onLanes={() => navigate('lanes')} onCard={() => navigate('card')} onReveal={() => navigate('reveal')}
    onFinal={() => { initAudio(); navigate('final') }}
    onDelete={() => setConfirmation({
      title: `Delete “${league.name}”?`,
      description: (() => {
        const n = league.matches.filter((m) => m.winner).length
        const results = n === 0 ? 'The league' : `The league, its ${n} recorded result${n === 1 ? '' : 's'}`
        return `${results}${league.wallpaper ? ' and its wallpaper' : ''} will be removed from this browser. This can’t be undone.`
      })(),
      label: 'Delete league',
      action: () => {
        try { persist(loaded.leagues.filter((l) => l.id !== league.id)); setLeagueId(null); navigate('home') }
        catch (e) { setError((e as Error).message) }
      } })}
    onWallpaper={(dataUrl) => update((l) => {
      const next = { ...l }
      if (dataUrl) next.wallpaper = dataUrl
      else delete next.wallpaper
      return next
    })}
    onUndo={() => setConfirmation({
      title: match?.winner ? `Undo match ${match.index + 1}’s result?` : `Abandon match ${(match?.index ?? 0) + 1}?`,
      description: match?.winner ? 'The winners lose the points from this match. Nothing else changes.'
        : 'This match is cleared. Replaying it draws exactly the same teams and the same wheel result.',
      label: 'Undo', action: () => { update(undo) } })} />
  else content = <div className="tn-page">
    <header className="tn-heading"><div><span className="tn-eyebrow">IN HOUSE / POINTS LEAGUE</span></div>
      <button className="tn-button" onClick={onExit}>← In House</button></header>
    <section className="tn-home-hero">
      <FaceCloud players={ROSTER} />
      <div className="tn-party-copy"><span className="tn-sticker">EVERY MAN FOR HIMSELF</span>
        <h2>Same ten.<br /><em>New teams every match.</em></h2>
        <p>Five matches. Random teammates. One personal leaderboard. Whoever carries hardest takes the pot, and whoever doesn’t, pays for it.</p>
        <div className="tn-actions"><button className="tn-button gold tn-big-button" disabled={!!loaded.error} onClick={() => navigate('setup')}>+ Create league</button></div></div>
      <div className="tn-home-emblem" aria-hidden="true"><span>🏆</span><b>POINTS LEAGUE</b><small>TRUST NOBODY</small></div>
    </section>
    <div className="tn-section-title"><h2>Your leagues</h2><span className="tn-chip">{loaded.leagues.length} SAVED</span></div>
    {loaded.leagues.length ? <div className="tn-events">{[...loaded.leagues].reverse().map((l) => {
      const leader = standings(l)[0]
      const m = currentMatch(l)
      return <button className={`tn-event-card ${l.wallpaper ? 'lg-card-wallpaper' : ''}`} key={l.id}
        style={l.wallpaper ? { '--lg-wallpaper': `url("${l.wallpaper}")` } as CSSProperties : undefined}
        onClick={() => { setLeagueId(l.id); navigate('dashboard') }}>
        <span className="tn-eyebrow">{isComplete(l) ? 'COMPLETED' : m ? `MATCH ${m.index + 1} · ${phaseOf(m) === 'DONE' ? 'DONE' : 'LIVE'}` : 'NOT STARTED'}</span>
        <h3>{l.name}</h3><p>{l.players.length} players · {l.rules.schedule.length} matches · pot {money(l, l.rules.entryFee * l.players.length)}</p>
        <div className="tn-event-card-bottom"><span>{leader.points ? `Leader: ${leader.player.name} (${leader.points} pts)` : 'Nobody has scored yet'}</span><strong>Open →</strong></div>
      </button>
    })}</div> : <div className="tn-empty"><strong>No leagues yet.</strong><p>Create one to set the ten, the schedule, and the pot.</p></div>}
    <p className="tn-note">Saved in this browser only. Run the night from one computer and screen-share it.</p>
  </div>

  return <div className={`tn-shell lg-shell ${view === 'card' ? 'tn-card-view' : ''} ${wallpaper ? 'has-wallpaper' : ''}`}
    style={wallpaper ? { '--lg-wallpaper': `url("${wallpaper}")` } as CSSProperties : undefined}>
    {(error || loaded.error) && <div className="tn-alert" role="alert"><strong>{error ?? `Save problem: ${loaded.error}`}</strong>
      {error && <button className="tn-button" onClick={() => setError(null)}>Dismiss</button>}</div>}
    {content}
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)} />}
  </div>
}
