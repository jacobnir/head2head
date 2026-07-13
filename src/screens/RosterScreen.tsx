import { motion } from 'framer-motion'
import { useState } from 'react'
import { AddPlayerModal } from '../components/AddPlayerModal'
import { Face } from '../components/Face'
import { tick } from '../lib/audio'
import { REQUIRED_PLAYERS } from '../lib/randomize'
import { ROSTER } from '../roster'
import type { Player } from '../types'

type Props = {
  selected: string[]
  onToggle: (id: string) => void
  onFight: (players: Player[]) => void
}

export function RosterScreen({ selected, onToggle, onFight }: Props) {
  const [rejected, setRejected] = useState(false)
  const [adding, setAdding] = useState(false)
  const count = selected.length
  const ready = count === REQUIRED_PLAYERS

  // The dev server rewrites customPlayers.json; a reload is the simplest way to pick the
  // new roster up, and Vite would HMR us anyway.
  const onAdded = (note: string | null) => {
    if (note) window.alert(`Player added.\n\n${note}`)
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
          return (
            <button
              key={p.id}
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
            </button>
          )
        })}

        <button className="roster-card add-card" onClick={() => setAdding(true)} type="button">
          <div className="add-plus">+</div>
          <span className="roster-name">ADD PLAYER</span>
        </button>
      </div>

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
          <span className="fight-btn-inner">{ready ? 'FIGHT NIGHT' : `NEED ${REQUIRED_PLAYERS - count} MORE`}</span>
        </button>
      </footer>

      <AddPlayerModal open={adding} onClose={() => setAdding(false)} onAdded={onAdded} />
    </div>
  )
}
