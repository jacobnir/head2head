import { motion } from 'framer-motion'
import { Face } from './Face'
import { ChampPool } from './ChampPool'
import { RankBadge } from './RankBadge'
import { nicknameFor, statsFor as fakeStatsFor } from '../lib/randomize'
import { statsFor as liveStatsFor } from '../lib/stats'
import type { Player, Team } from '../types'
import { StatBars } from './StatBars'

export type Beat = 'IDLE' | 'IN' | 'LUNGE' | 'IMPACT' | 'STATS' | 'TAGS' | 'OUT'

type Props = {
  player: Player
  team: Team
  beat: Beat
  seed: number
  hypeTag: string
}

const ORDER: Beat[] = ['IDLE', 'IN', 'LUNGE', 'IMPACT', 'STATS', 'TAGS', 'OUT']
const at = (beat: Beat, min: Beat) => ORDER.indexOf(beat) >= ORDER.indexOf(min)

export function FighterCard({ player, team, beat, seed, hypeTag }: Props) {
  const blue = team === 'BLUE'
  const dir = blue ? -1 : 1 // which side they fly in from

  const live = liveStatsFor(player)
  const fake = fakeStatsFor(player, seed)

  const variants = {
    IDLE: { x: dir * 120 + 'vw', opacity: 0, scale: 1.4, rotate: dir * 14 },
    IN: { x: 0, opacity: 1, scale: 1, rotate: 0 },
    LUNGE: { x: -dir * 70, opacity: 1, scale: 1.06, rotate: -dir * 4 },
    IMPACT: { x: dir * 26, opacity: 1, scale: 1, rotate: dir * 2 },
    STATS: { x: 0, opacity: 1, scale: 1, rotate: 0 },
    TAGS: { x: 0, opacity: 1, scale: 1, rotate: 0 },
    OUT: { x: dir * 60 + 'vw', opacity: 0, scale: 0.9, rotate: -dir * 8 },
  } as const

  // The fly-in is a hard, fast rocket; the impact recoil is snappier still.
  const transition =
    beat === 'IN'
      ? { type: 'spring' as const, stiffness: 260, damping: 18, mass: 0.9 }
      : beat === 'LUNGE'
        ? { duration: 0.28, ease: [0.5, 0, 0.9, 0.2] as [number, number, number, number] }
        : beat === 'IMPACT'
          ? { type: 'spring' as const, stiffness: 700, damping: 12 }
          : beat === 'OUT'
            ? { duration: 0.4, ease: [0.6, 0, 1, 0.4] as [number, number, number, number] }
            : { type: 'spring' as const, stiffness: 200, damping: 20 }

  return (
    <motion.div
      className={`fighter ${team.toLowerCase()}`}
      variants={variants}
      initial="IDLE"
      animate={beat}
      transition={transition}
    >
      <div className="fighter-portrait">
        <div className="aura" />
        <Face src={player.img} alt={player.name} className="fighter-face" />

        {at(beat, 'TAGS') && (
          <motion.div
            className="hype-stamp"
            initial={{ scale: 3.2, opacity: 0, rotate: dir * 18 }}
            animate={{ scale: 1, opacity: 1, rotate: dir * -7 }}
            transition={{ type: 'spring', stiffness: 500, damping: 14 }}
          >
            {hypeTag}
          </motion.div>
        )}
      </div>

      <div className="fighter-plate">
        <span className="fighter-team">{team}</span>
        <h3 className="fighter-name">{player.name}</h3>
        <span className="fighter-nick">“{nicknameFor(player, seed)}”</span>

        {live && (
          <div className="fighter-riot">
            <span className="riot-id">{live.riotId}</span>
            {live.level !== undefined && <span className="riot-level">LVL {live.level}</span>}
          </div>
        )}
      </div>

      {/* Real rank, if we have it. */}
      {live && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={at(beat, 'STATS') ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        >
          <RankBadge rank={live.rank} />
        </motion.div>
      )}

      {/* Their real three most-played champs — or the joke bars if we have no data. */}
      {live && live.topChamps.length > 0 ? (
        <ChampPool champs={live.topChamps} team={team} show={at(beat, 'STATS')} />
      ) : (
        <StatBars stats={fake} team={team} show={at(beat, 'STATS')} />
      )}
    </motion.div>
  )
}
