import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { Face } from '../components/Face'
import { riser } from '../lib/audio'
import { shake } from '../fx/screen'
import type { Player } from '../types'

export const SHUFFLE_MS = 2500

/** All ten faces churning in a vortex while the tension builds. */
export function ShuffleScreen({ players, onDone }: { players: Player[]; onDone: () => void }) {
  useEffect(() => {
    const stopRiser = riser(SHUFFLE_MS / 1000)
    shake(4, SHUFFLE_MS * 0.9)
    const t = window.setTimeout(onDone, SHUFFLE_MS)
    return () => {
      window.clearTimeout(t)
      stopRiser()
    }
  }, [onDone])

  return (
    <div className="screen shuffle-screen">
      <div className="vortex">
        {players.map((p, i) => {
          const angle = (i / players.length) * Math.PI * 2
          const radius = 210
          return (
            <motion.div
              key={p.id}
              className="vortex-face"
              initial={{
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                scale: 1,
                opacity: 0.9,
              }}
              animate={{
                x: [Math.cos(angle) * radius, Math.cos(angle + Math.PI * 4) * radius * 0.3, 0],
                y: [Math.sin(angle) * radius, Math.sin(angle + Math.PI * 4) * radius * 0.3, 0],
                scale: [1, 0.7, 0.2],
                opacity: [0.9, 1, 0],
                rotate: [0, 540, 900],
              }}
              transition={{ duration: SHUFFLE_MS / 1000, ease: [0.5, 0, 0.75, 0], times: [0, 0.7, 1] }}
            >
              <Face src={p.img} alt={p.name} className="vortex-img" />
            </motion.div>
          )
        })}
      </div>

      <motion.h2
        className="shuffle-text"
        animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.08, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
      >
        SEEDING THE BRACKET…
      </motion.h2>
    </div>
  )
}
