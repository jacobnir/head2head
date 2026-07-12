import { motion } from 'framer-motion'
import type { TeamChance } from '../lib/stats'

/**
 * Overall team projection, as a tug-of-war bar.
 *
 * Driven by AVERAGE TEAM RANK, not by the head-to-head lanes — so a strong player still
 * counts for his team even when he's drawn against someone unranked. Shows each side's
 * average so the number is explainable rather than magic.
 */
export function TaleOfTheTape({ chance }: { chance: TeamChance | null }) {
  if (!chance) return null

  const { bluePct, redPct, blue, red } = chance
  const edge = Math.abs(bluePct - 50)
  const leader = bluePct > 50 ? 'BLUE' : 'RED'

  const verdict =
    edge < 3
      ? 'DEAD EVEN'
      : edge < 8
        ? `${leader} EDGE`
        : edge < 16
          ? `${leader} FAVOURED`
          : `${leader} SHOULD WIN THIS`

  // Be explicit about what the number does and doesn't cover.
  const partial = blue.ranked < blue.size || red.ranked < red.size
  const anyFlex = blue.flex + red.flex > 0

  const caveats = [
    partial && 'excluding unranked',
    anyFlex && `${blue.flex + red.flex} flex rank${blue.flex + red.flex > 1 ? 's' : ''}`,
  ].filter(Boolean)

  return (
    <motion.div
      className="tape"
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 220, damping: 22 }}
    >
      <div className="tape-head">
        <span className="tape-avg blue">
          AVG {blue.label}
          <em>
            {blue.ranked}/{blue.size} ranked
          </em>
        </span>
        <span className="tape-verdict">{verdict}</span>
        <span className="tape-avg red">
          AVG {red.label}
          <em>
            {red.ranked}/{red.size} ranked
          </em>
        </span>
      </div>

      <div className="tape-bar">
        <motion.div
          className="tape-fill blue"
          initial={{ width: '50%' }}
          animate={{ width: `${bluePct}%` }}
          transition={{ delay: 0.5, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="tape-fill red"
          initial={{ width: '50%' }}
          animate={{ width: `${redPct}%` }}
          transition={{ delay: 0.5, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        <span className="tape-pct blue">{bluePct}%</span>
        <span className="tape-pct red">{redPct}%</span>
      </div>

      <span className="tape-note">
        PROJECTED WIN CHANCE — FROM AVERAGE TEAM RANK
        {caveats.length > 0 && ` · ${caveats.join(' · ')}`}
      </span>
    </motion.div>
  )
}
