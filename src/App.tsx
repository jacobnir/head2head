import { useCallback, useEffect, useState } from 'react'
import { FxCanvas } from './fx/FxCanvas'
import { clearParticles } from './fx/particles'
import { resetScreen } from './fx/screen'
import { initAudio, isMuted, setMuted } from './lib/audio'
import { randomize } from './lib/randomize'
import { preloadFaces } from './lib/trimFace'
import { ROSTER } from './roster'
import { RevealScreen } from './screens/RevealScreen'
import { RosterScreen } from './screens/RosterScreen'
import { ScoreboardScreen } from './screens/ScoreboardScreen'
import { ShuffleScreen } from './screens/ShuffleScreen'
import type { MatchResult, Player } from './types'

type Stage = 'ROSTER' | 'SHUFFLE' | 'REVEAL' | 'SCOREBOARD'

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
        {stage === 'ROSTER' && <RosterScreen selected={selected} onToggle={toggle} onFight={startFight} />}

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
