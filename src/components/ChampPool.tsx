import { motion } from 'framer-motion'
import { championIcon, formatMastery, winRate } from '../lib/stats'
import type { ChampStat, Team } from '../types'

/**
 * Their three most-played champions, with real portraits from Riot's CDN.
 * Renders nothing when there's no synced data — the fighter card just closes up.
 */
export function ChampPool({ champs, team, show }: { champs: ChampStat[]; team: Team; show: boolean }) {
  if (!champs.length) return null

  return (
    <div className={`champpool ${team.toLowerCase()}`}>
      {champs.map((c, i) => {
        const wr = winRate(c)
        return (
          <motion.div
            className="champ"
            key={c.key}
            initial={{ scale: 0, opacity: 0, y: 14 }}
            animate={show ? { scale: 1, opacity: 1, y: 0 } : { scale: 0, opacity: 0, y: 14 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18, delay: show ? i * 0.09 : 0 }}
          >
            <div className="champ-icon-wrap">
              <img className="champ-icon" src={championIcon(c)} alt={c.name} draggable={false} />
              <span className="champ-mastery">{formatMastery(c.masteryPoints)}</span>
            </div>
            <span className="champ-name">{c.name}</span>
            {wr !== null && (
              <span className={`champ-wr ${wr >= 55 ? 'hot' : wr < 45 ? 'cold' : ''}`}>
                {wr}% <em>{c.recent!.games}g</em>
              </span>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
