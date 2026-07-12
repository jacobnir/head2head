import { motion } from 'framer-motion'
import type { Lane } from '../types'

const LANE_ICON: Record<Lane, string> = {
  TOP: '⚔️',
  JUNGLE: '🌳',
  MID: '🔮',
  ADC: '🏹',
  SUPPORT: '🛡️',
}

/** Slams in from nothing with an impact scale. */
export function LaneBanner({ lane, index, total }: { lane: Lane; index: number; total: number }) {
  return (
    <motion.div
      className="lane-banner"
      initial={{ scale: 6, opacity: 0, filter: 'blur(14px)' }}
      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.32, ease: [0.2, 1.4, 0.35, 1] }}
    >
      <span className="lane-icon">{LANE_ICON[lane]}</span>
      <h2 className="lane-name">{lane}</h2>
      <span className="lane-count">
        BOUT {index + 1} / {total}
      </span>
    </motion.div>
  )
}
