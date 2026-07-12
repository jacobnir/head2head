import { useCallback, useEffect, useState } from 'react'
import { clearParticles } from '../fx/particles'
import { resetScreen } from '../fx/screen'
import type { MatchResult } from '../types'
import { LaneReveal } from './LaneReveal'

type Props = {
  result: MatchResult
  onDone: () => void
}

export function RevealScreen({ result, onDone }: Props) {
  const [index, setIndex] = useState(0)
  const [advanceSignal, setAdvanceSignal] = useState(0)
  const total = result.matchups.length

  /**
   * Nothing auto-advances. Each press is handed to the current bout, which decides
   * what it means: mid-sequence it fast-forwards to the result, once finished it
   * moves on. So you can linger on a matchup as long as the trash talk needs.
   */
  const advance = useCallback(() => {
    setAdvanceSignal((n) => n + 1)
  }, [])

  const next = useCallback(() => {
    resetScreen()
    clearParticles()
    setAdvanceSignal(0) // reset for the incoming bout
    setIndex((i) => {
      if (i + 1 >= total) {
        onDone()
        return i
      }
      return i + 1
    })
  }, [total, onDone])

  const skipAll = useCallback(() => {
    resetScreen()
    clearParticles()
    onDone()
  }, [onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        advance()
      } else if (e.code === 'Escape') {
        e.preventDefault()
        skipAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, skipAll])

  useEffect(() => () => resetScreen(), [])

  return (
    <div className="screen reveal-screen" onClick={advance}>
      <LaneReveal
        key={index}
        matchup={result.matchups[index]}
        index={index}
        total={total}
        seed={result.seed}
        advanceSignal={advanceSignal}
        onComplete={next}
      />

      <div className="skip-hint">
        <kbd>SPACE</kbd> / click to continue · <kbd>ESC</kbd> jump to fight card
      </div>
    </div>
  )
}
