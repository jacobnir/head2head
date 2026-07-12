import { motion } from 'framer-motion'
import { mismatchTag } from '../lib/stats'
import type { Odds } from '../types'

/**
 * Split-flap betting odds.
 *
 * When both fighters have synced ranked data the line is derived from their actual rank
 * gap, and the board says so. Otherwise it's seeded nonsense and admits it.
 */
export function OddsBoard({ odds, show }: { odds: Odds; show: boolean }) {
  const mismatch = odds.real && odds.gap !== undefined ? mismatchTag(odds.gap) : null

  return (
    <motion.div
      className={`odds ${odds.real ? 'real' : ''}`}
      initial={{ opacity: 0, y: 18, rotateX: -80 }}
      animate={show ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 18, rotateX: -80 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="odds-title">{odds.real ? 'THE BOOKS (BY RANK)' : 'VEGAS SAYS'}</span>
      <div className="odds-row">
        <span className={`odds-val blue ${odds.favorite === 'BLUE' ? 'fav' : ''}`}>{odds.blue}</span>
        <span className="odds-sep">/</span>
        <span className={`odds-val red ${odds.favorite === 'RED' ? 'fav' : ''}`}>{odds.red}</span>
      </div>
      {mismatch && <span className="odds-mismatch">{mismatch}</span>}
    </motion.div>
  )
}
