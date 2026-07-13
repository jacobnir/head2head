import { motion } from 'framer-motion'
import { useState } from 'react'
import { Face } from '../components/Face'
import { PlayerModal } from '../components/PlayerModal'
import { RankBadge } from '../components/RankBadge'
import { tick } from '../lib/audio'
import { REQUIRED_PLAYERS } from '../lib/randomize'
import { statsFor } from '../lib/stats'
import { HIDDEN, ROSTER } from '../roster'
import type { Player } from '../types'

type Props = {
  selected: string[]
  onToggle: (id: string) => void
  onFight: (players: Player[]) => void
}

export function RosterScreen({ selected, onToggle, onFight }: Props) {
  const [rejected, setRejected] = useState(false)
  /** null = modal closed, 'new' = adding, a Player = editing them. */
  const [editing, setEditing] = useState<Player | 'new' | null>(null)

  const count = selected.length
  const ready = count === REQUIRED_PLAYERS

  // The dev server rewrote customPlayers/playerOverrides/playerStats on disk. Vite would
  // HMR us anyway; a reload is the simplest way to be sure we're on the new roster.
  const onSaved = (note: string | null) => {
    if (note) window.alert(note)
    window.location.reload()
  }

  const handleToggle = (id: string) => {
    const isSelected = selected.includes(id)
    // At a full roster, block the 11th pick rather than silently evicting someone.
    if (!isSelected && count >= REQUIRED_PLAYERS) {
      setRejected(true)
      window.setTimeout(() => setRejected(false), 400)
      return
    }
    tick()
    onToggle(id)
  }

  const restore = async (p: Player) => {
    await fetch('/api/roster/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id }),
    })
    window.location.reload()
  }

  const handleFight = () => {
    if (!ready) return
    const players = selected
      .map((id) => ROSTER.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
    onFight(players)
  }

  return (
    <div className="screen roster-screen">
      <header className="roster-header">
        <h1 className="title">
          <span className="title-fight">FIGHT</span>
          <span className="title-night">NIGHT</span>
        </h1>
        <p className="subtitle">SELECT YOUR TEN COMBATANTS</p>
      </header>

      <div className="roster-grid">
        {ROSTER.map((p) => {
          const on = selected.includes(p.id)
          const live = statsFor(p)

          return (
            // The edit control is a sibling of the card, not a child — a button inside a
            // button is invalid, and nesting would also make the click target ambiguous.
            <div className="roster-slot" key={p.id}>
              <button
                className={`roster-card ${on ? 'selected' : ''}`}
                onClick={() => handleToggle(p.id)}
                type="button"
              >
                <div className="roster-portrait">
                  <Face src={p.img} alt={p.name} className="roster-face" />
                  {on && <span className="roster-check">✓</span>}
                </div>
                <span className="roster-name">{p.name}</span>
                {p.nickname && <span className="roster-nick">“{p.nickname}”</span>}

                {live?.rank ? (
                  <RankBadge rank={live.rank} short />
                ) : (
                  <span className="roster-nolink">{p.riotId ? 'UNRANKED' : 'NO RIOT ID'}</span>
                )}
              </button>

              <button
                className="edit-btn"
                onClick={() => setEditing(p)}
                type="button"
                title={`Edit ${p.name}`}
                aria-label={`Edit ${p.name}`}
              >
                ✎
              </button>
            </div>
          )
        })}

        <div className="roster-slot">
          <button
            className="roster-card add-card"
            onClick={() => setEditing('new')}
            type="button"
          >
            <div className="add-plus">+</div>
            <span className="roster-name">ADD PLAYER</span>
          </button>
        </div>
      </div>

      {/* Hiding a built-in must not be a one-way door — bring them back from here. */}
      {HIDDEN.length > 0 && (
        <div className="hidden-strip">
          <span className="hidden-label">HIDDEN</span>
          {HIDDEN.map((p) => (
            <button
              className="hidden-chip"
              key={p.id}
              onClick={() => void restore(p)}
              type="button"
              title={`Restore ${p.name}`}
            >
              <Face src={p.img} alt="" className="hidden-face" />
              {p.name}
              <span className="hidden-restore">↩</span>
            </button>
          ))}
        </div>
      )}

      <footer className="roster-footer">
        <motion.div
          className={`counter ${ready ? 'ready' : ''} ${rejected ? 'rejected' : ''}`}
          animate={rejected ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span className="counter-num">{count}</span>
          <span className="counter-of">/ {REQUIRED_PLAYERS}</span>
        </motion.div>

        <button className="fight-btn" disabled={!ready} onClick={handleFight} type="button">
          <span className="fight-btn-inner">
            {ready ? 'FIGHT NIGHT' : `NEED ${REQUIRED_PLAYERS - count} MORE`}
          </span>
        </button>
      </footer>

      <PlayerModal target={editing} onClose={() => setEditing(null)} onSaved={onSaved} />
    </div>
  )
}
