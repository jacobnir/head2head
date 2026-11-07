import { lazy, Suspense, useCallback, useEffect, useReducer, useState } from 'react'
import { FxCanvas } from './fx/FxCanvas'
import { clearParticles } from './fx/particles'
import { resetScreen } from './fx/screen'
import { initAudio, isMuted, setMuted } from './lib/audio'
import { randomize } from './lib/randomize'
import { loadLiveRanks, RANKS_UPDATED } from './lib/stats'
import { preloadFaces } from './lib/trimFace'
import { ROSTER } from './roster'
import { RevealScreen } from './screens/RevealScreen'
import { RosterScreen } from './screens/RosterScreen'
import { ScoreboardScreen } from './screens/ScoreboardScreen'
import { ShuffleScreen } from './screens/ShuffleScreen'
import type { MatchResult, Player } from './types'

const TournamentMode = lazy(() => import('./tournament/TournamentMode'))
const LeagueMode = lazy(() => import('./league/LeagueMode'))
type Stage = 'ROSTER' | 'SHUFFLE' | 'REVEAL' | 'SCOREBOARD' | 'TOURNAMENT' | 'LEAGUE'

const STORAGE_KEY = 'fightnight.selected'

function loadSelected(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const ids: unknown = JSON.parse(raw)
    if (!Array.isArray(ids)) return []
    // Drop anyone who's since been removed from the roster.
    return ids.filter((id): id is string => typeof id === 'string' && ROSTER.some((p) => p.id === id))
  } catch {
    return []
  }
}

export default function App() {
  const [stage, setStage] = useState<Stage>('ROSTER')
  const [selected, setSelected] = useState<string[]>(loadSelected)
  const [fighters, setFighters] = useState<Player[]>([])
  const [result, setResult] = useState<MatchResult | null>(null)
  const [muted, setMutedState] = useState(isMuted())

  // Crop every face up front so no reveal ever pops in half-loaded.
  useEffect(() => {
    void preloadFaces(ROSTER.map((p) => p.img))
  }, [])

  // Hosted build only: pull live ranks from /api/ranks and re-render when they land.
  // `npm run dev` gets fresh ranks from its own launch sync instead.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    window.addEventListener(RANKS_UPDATED, rerender)
    if (import.meta.env.PROD) void loadLiveRanks()
    return () => window.removeEventListener(RANKS_UPDATED, rerender)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected))
  }, [selected])

  const toggle = useCallback((id: string) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }, [])

  const startFight = useCallback((players: Player[]) => {
    initAudio() // browsers need a user gesture — this click is it
    setFighters(players)
    setResult(randomize(players))
    setStage('SHUFFLE')
  }, [])

  const reroll = useCallback(() => {
    resetScreen()
    clearParticles()
    setResult(randomize(fighters))
    setStage('SHUFFLE')
  }, [fighters])

  const backToRoster = useCallback(() => {
    resetScreen()
    clearParticles()
    setStage('ROSTER')
  }, [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  return (
    <div className="app">
      <div className="grain" />
      <div className="shake-root">
        {stage === 'ROSTER' && <RosterScreen selected={selected} onToggle={toggle} onFight={startFight} onTournament={() => setStage('TOURNAMENT')} onLeague={() => setStage('LEAGUE')} />}

        {stage === 'LEAGUE' && <Suspense fallback={<div className="tournament-loading">Loading points league…</div>}>
          <LeagueMode initialSelected={selected} onExit={backToRoster} />
        </Suspense>}

        {stage === 'TOURNAMENT' && <Suspense fallback={<div className="tournament-loading">Loading tournament mode…</div>}>
          <TournamentMode onExit={backToRoster} />
        </Suspense>}

        {stage === 'SHUFFLE' && <ShuffleScreen players={fighters} onDone={() => setStage('REVEAL')} />}

        {stage === 'REVEAL' && result && (
          <RevealScreen result={result} onDone={() => setStage('SCOREBOARD')} />
        )}

        {stage === 'SCOREBOARD' && result && (
          <ScoreboardScreen result={result} onReroll={reroll} onBack={backToRoster} />
        )}
      </div>

      <button className="mute-btn" onClick={toggleMute} type="button" title={muted ? 'Unmute' : 'Mute'}>
        {muted ? '🔇' : '🔊'}
      </button>

      <FxCanvas />
    </div>
  )
}
