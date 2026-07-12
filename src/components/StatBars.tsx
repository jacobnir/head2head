import { motion } from 'framer-motion'
import type { Stat, Team } from '../types'

type Props = {
  stats: Stat[]
  team: Team
  show: boolean
}

/** Entirely fictional numbers, presented with total confidence. */
export function StatBars({ stats, team, show }: Props) {
  return (
    <div className={`statbars ${team.toLowerCase()}`}>
      {stats.map((s, i) => (
        <div className="statbar" key={s.label}>
          <span className="statbar-label">{s.label}</span>
          <div className="statbar-track">
            <motion.div
              className="statbar-fill"
              initial={{ width: 0 }}
              animate={{ width: show ? `${s.value}%` : 0 }}
              transition={{ duration: 0.55, delay: show ? i * 0.08 : 0, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <motion.span
            className="statbar-value"
            initial={{ opacity: 0 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ delay: show ? i * 0.08 + 0.3 : 0 }}
          >
            {s.value}
          </motion.span>
        </div>
      ))}
    </div>
  )
}
