import { useEffect, useRef, useState } from 'react'
import { initAudio } from '../lib/audio'
import { clearParticles } from '../fx/particles'
import { resetScreen } from '../fx/screen'
import { RevealScreen } from '../screens/RevealScreen'
import { ScoreboardScreen } from '../screens/ScoreboardScreen'
import { recordWinner, savePrediction, startGame, startTournament, tournamentState, undoGame } from './engine'
import { parseLibrary, readLibrary, recoverLibrary, writeLibrary, type Library, type LoadedLibrary } from './storage'
import { TournamentSetup } from './TournamentSetup'
import { TournamentDashboard, prizeLabel } from './TournamentDashboard'
import { ChampionCeremony, TournamentDraw } from './TournamentCeremony'
import { FaceCloud, FaceCrew } from './TournamentShowtime'
import type { Tournament } from './types'
import '../styles/tournament.css'
import '../styles/tournament-party.css'

type View = 'events' | 'setup' | 'dashboard' | 'draw' | 'reveal' | 'card' | 'champions'
type Confirmation = { title: string; description: string; label: string; action: () => void }
function ConfirmAction({ confirmation, onClose }: { confirmation: Confirmation; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog className="tn-confirm" ref={dialog} aria-labelledby="tn-confirm-title" onCancel={(e) => { e.preventDefault(); onClose() }}>
    <span className="tn-eyebrow">HOST CONTROL</span><h2 id="tn-confirm-title">{confirmation.title}</h2><p>{confirmation.description}</p>
    <div className="tn-actions"><button className="tn-button" onClick={onClose}>Cancel</button><button className="tn-button gold" onClick={() => { onClose(); confirmation.action() }}>{confirmation.label}</button></div>
  </dialog>
}
function load(): LoadedLibrary {
  try { return readLibrary(window.localStorage) }
  catch { return { library: { version: 1, events: [] }, raw: null, error: 'This browser cannot access local storage.' } }
}
function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TournamentMode({ onExit }: { onExit: () => void }) {
  const [loaded, setLoaded] = useState(load)
  const [view, setView] = useState<View>('events')
  const [pausedAntics, setPausedAntics] = useState(false)
  const [eventId, setEventId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [gameRef, setGameRef] = useState<{ seriesId: string; index: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const tournament = loaded.library.events.find((t) => t.id === eventId)
  const navigate = (next: View) => { resetScreen(); clearParticles(); setError(null); setView(next) }

  const persist = (library: Library) => {
    const raw = writeLibrary(window.localStorage, library, loaded.raw)
    setLoaded({ library, raw, error: null })
    setError(null)
  }
  const update = (operation: (t: Tournament) => Tournament): Tournament | null => {
    try {
      if (!tournament) throw new Error('Select a tournament first.')
      const next = operation(tournament)
      persist({ version: 1, events: loaded.library.events.map((t) => t.id === next.id ? next : t) })
      return next
    } catch (e) { setError((e as Error).message); return null }
  }
  const onSave = (event: Tournament) => {
    const save = () => {
      try {
        persist({ version: 1, events: [...loaded.library.events.filter((t) => t.id !== event.id), event] })
        setEventId(event.id); navigate('dashboard')
      } catch (e) { setError((e as Error).message) }
    }
    if (tournament?.predictions.length) setConfirmation({ title: 'Redraw this draft?', description: 'Saving setup changes redraws the bracket and clears this draft’s predictions.', label: 'Save and redraw', action: save })
    else save()
  }
  const importFile = async (file: File) => {
    try {
      const incoming = parseLibrary(await file.text())
      if (loaded.error) {
        setConfirmation({ title: 'Recover your events?', description: 'Your unreadable save will be backed up in this browser before this file replaces it.', label: 'Recover events', action: () => {
          try {
            const raw = recoverLibrary(window.localStorage, incoming, loaded.raw)
            setLoaded({ library: incoming, raw, error: null }); setEventId(null); navigate('events')
          } catch (e) { setError(`Recovery failed: ${(e as Error).message}. The existing save was kept.`) }
        } })
        return
      } else {
        const ids = new Set(loaded.library.events.map((t) => t.id))
        const events = incoming.events.map((t) => ids.has(t.id) ? { ...t, id: crypto.randomUUID(), name: `${t.name} (imported)` } : t)
        persist({ version: 1, events: [...loaded.library.events, ...events] })
      }
      setEventId(null); navigate('events')
    } catch (e) { setError(`Import failed: ${(e as Error).message}. The existing save was kept.`) }
  }
  const exportEvent = () => { if (tournament) download(JSON.stringify({ version: 1, events: [tournament] }, null, 2), 'in-house-tournament.json') }
  const viewGame = (seriesId: string, index: number, reveal = false) => {
    initAudio(); setGameRef({ seriesId, index }); navigate(reveal ? 'reveal' : 'card')
  }
  const winner = (seriesId: string, gameId: string, winnerId: string) => {
    const team = tournament?.teams.find((t) => t.id === winnerId)
    setConfirmation({ title: `${team?.name} wins?`, description: `Record the result for ${gameId}. The bracket and prediction scores will update automatically.`, label: 'Confirm result', action: () => {
      const next = update((t) => recordWinner(t, seriesId, gameId, winnerId))
      if (next) { initAudio(); navigate(tournamentState(next).championId ? 'champions' : 'dashboard') }
    } })
  }

  const selectedSeries = tournament?.series.find((s) => s.id === gameRef?.seriesId)
  const selectedGame = selectedSeries?.games[gameRef?.index ?? -1]
  const gameState = tournament ? tournamentState(tournament).series.find((s) => s.series.id === selectedSeries?.id) : null
  const context = tournament && selectedSeries && gameState
    ? `${selectedSeries.label} · ${tournament.teams.find((t) => t.id === gameState.teams[0])?.name} ${gameState.score[0]} – ${gameState.score[1]} ${tournament.teams.find((t) => t.id === gameState.teams[1])?.name} · Game ${(gameRef?.index ?? 0) + 1}` : ''

  let content
  if (view === 'setup') content = <TournamentSetup key={eventId ?? 'new'} initial={tournament} onSave={onSave} onCancel={() => navigate(tournament ? 'dashboard' : 'events')} />
  else if (tournament && view === 'draw') content = <TournamentDraw tournament={tournament} onDone={() => navigate('dashboard')} />
  else if (tournament && view === 'champions' && tournamentState(tournament).championId) content = <ChampionCeremony tournament={tournament} onDone={() => navigate('dashboard')} />
  else if (tournament && selectedGame && selectedSeries && view === 'reveal') content = <RevealScreen result={selectedGame.result} contextLabel={context} onDone={() => navigate('card')} />
  else if (tournament && selectedGame && selectedSeries && view === 'card') content = <ScoreboardScreen result={selectedGame.result}
    title="TOURNAMENT FIGHT CARD" subtitle={context}
    blueLabel={`${tournament.teams.find((t) => t.id === selectedGame.blueTeamId)?.name} · BLUE`}
    redLabel={`${tournament.teams.find((t) => t.id === selectedGame.redTeamId)?.name} · RED`}
    onBack={() => navigate('dashboard')} footer={<>
      <button className="btn ghost" onClick={() => navigate('dashboard')}>← Tournament</button>
      <button className="btn ghost" onClick={() => viewGame(selectedSeries.id, gameRef!.index, true)}>Replay reveal</button>
      {!selectedGame.winnerId ? [selectedGame.blueTeamId, selectedGame.redTeamId].map((id) => <button className="btn primary" key={id} onClick={() => winner(selectedSeries.id, selectedGame.id, id)}>{tournament.teams.find((t) => t.id === id)?.name} wins</button>)
        : <span className="tn-chip">WINNER: {tournament.teams.find((t) => t.id === selectedGame.winnerId)?.name}</span>}
    </>} />
  else if (tournament && view !== 'events') content = <TournamentDashboard key={tournament.id} tournament={tournament}
    onBack={() => navigate('events')} onEdit={() => navigate('setup')} onExport={exportEvent}
    onStart={() => { if (update((t) => startTournament(t, new Date().toISOString()))) { initAudio(); navigate('draw') } }}
    onDraw={() => { initAudio(); navigate('draw') }} onChampions={() => { initAudio(); navigate('champions') }}
    onSavePrediction={(p) => !!update((t) => savePrediction(t, p))}
    onStartGame={(id, roles) => {
      const next = update((t) => startGame(t, id, new Date().toISOString(), roles))
      if (next) viewGame(id, next.series.find((s) => s.id === id)!.games.length - 1, true)
    }} onViewGame={viewGame} onWinner={winner}
    onUndo={(id) => setConfirmation({ title: 'Undo the last game?', description: 'Later dependent games must be undone first. Predictions stay locked, and the next reveal uses the same saved draw seed.', label: 'Undo game', action: () => { update((t) => undoGame(t, id)) } })} />
  else content = <div className="tn-page">
    <header className="tn-heading"><div><span className="tn-eyebrow">IN HOUSE / TOURNAMENT MODE</span><h1>Small prize pool.<br /><em>Massive egos.</em></h1>
      <p>Your friends. A real bracket. An unreasonable amount of drama.</p></div><button className="tn-button" onClick={onExit}>← In House</button></header>
    <section className="tn-home-hero"><FaceCloud players={loaded.library.events[loaded.library.events.length - 1]?.teams.flatMap((team) => team.players) ?? []} /><div className="tn-party-copy"><span className="tn-sticker">LOCALLY SOURCED CHAOS</span><h2>Enter as friends.<br />Leave with receipts.</h2>
      <p>Assemble the squads. Draw the bracket. Make it everybody’s problem.</p>
      <div className="tn-actions"><button className="tn-button gold" disabled={!!loaded.error} onClick={() => { setEventId(null); navigate('setup') }}>+ Create tournament</button>
        <button className="tn-button" onClick={() => fileInput.current?.click()}>{loaded.error ? 'Import recovery file' : 'Import tournament'}</button></div></div>
      <div className="tn-home-emblem" aria-hidden="true"><span>♛</span><b>IN HOUSE</b><small>HIGH STAKES. LOW STANDARDS.</small></div></section>
    <div className="tn-section-title"><h2>Your events</h2><span className="tn-chip">{loaded.library.events.length} SAVED</span></div>
    {loaded.library.events.length ? <div className="tn-events">{[...loaded.library.events].reverse().map((t) => {
      const state = tournamentState(t)
      return <button className="tn-event-card" key={t.id} onClick={() => { setEventId(t.id); navigate('dashboard') }}>
        <span className="tn-eyebrow">{state.championId ? 'COMPLETED' : t.startedAt ? 'IN PROGRESS' : 'DRAFT'}</span><h3>{t.name}</h3>
        <FaceCrew players={(t.teams.find((team) => team.id === state.championId) ?? t.teams[0]).players} crowned={!!state.championId} />
        <p>{t.teams.length} teams · {t.rules.format === 'single' ? 'Single' : 'Double'} elimination</p>
        <div className="tn-event-card-bottom"><span>{state.championId ? `♛ ${t.teams.find((team) => team.id === state.championId)?.name}` : prizeLabel(t) ?? 'Bragging rights on the line'}</span><strong>{t.startedAt ? 'Open event' : 'Continue setup'} →</strong></div>
      </button>
    })}</div> : <div className="tn-empty"><strong>Your first title is waiting.</strong><p>Create an event to assemble the teams and draw the bracket.</p></div>}
    <p className="tn-note">Saved automatically in this browser. Export a copy to back up an event or move it to another computer. Portrait images remain local to this app.</p>
  </div>

  return <div className={`tn-shell ${view === 'card' ? 'tn-card-view' : ''} ${pausedAntics ? 'tn-paused-antics' : ''}`}>
    {view !== 'card' && view !== 'reveal' && <button className="tn-motion-switch" aria-pressed={pausedAntics} onClick={() => setPausedAntics((v) => !v)}>{pausedAntics ? '▶ Resume antics' : 'Ⅱ Pause antics'}</button>}
    <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="Import tournament file" onChange={(e) => {
      const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file)
    }} />
    {(error || loaded.error) && <div className="tn-alert" role="alert"><strong>{error ?? `Save recovery needed: ${loaded.error}`}</strong>
      {loaded.error ? <><p>Your existing save has not been overwritten. Download it for recovery, then import a valid event file.</p>
        {loaded.raw !== null && <button className="tn-button" onClick={() => download(loaded.raw!, 'in-house-unreadable-save.json')}>Download original save</button>}</>
        : <button className="tn-button" onClick={() => setError(null)}>Dismiss</button>}</div>}
    {content}
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)} />}
  </div>
}
