import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { Face } from '../components/Face'
import { RankBadge } from '../components/RankBadge'
import { airhorn, bell } from '../lib/audio'
import { nicknameFor } from '../lib/randomize'
import { TaleOfTheTape } from '../components/TaleOfTheTape'
import { championIcon, laneWinChance, statsFor, teamWinChance } from '../lib/stats'
import { spawnConfetti } from '../fx/particles'
import type { MatchResult, Matchup, Player, Team } from '../types'

type Props = {
  result: MatchResult
  onReroll: () => void
  onBack: () => void
}

const CURSE_BADGE: Record<string, string> = {
  SWAP: '🔀 SWAPPED',
  EARTHQUAKE: '🌋 RE-DRAWN',
  CURSED_LANE: '💀 CURSED — LOSER BUYS FOOD',
}

/** One fighter's slot on a fight-card row: face, name, real rank, signature champ. */
function CardSide({ player, team, seed }: { player: Player; team: Team; seed: number }) {
  const live = statsFor(player)
  const main = live?.topChamps[0]

  const text = (
    <div className="card-text">
      <span className="card-name">{player.name}</span>
      <span className="card-nick">“{nicknameFor(player, seed)}”</span>
      {live && (
        <span className="card-meta">
          <RankBadge rank={live.rank} short />
          {main && <span className="card-main">{main.name}</span>}
        </span>
      )}
    </div>
  )

  const face = <Face src={player.img} alt={player.name} className="card-face" />
  const champ = main ? (
    <img className="card-champ" src={championIcon(main)} alt={main.name} title={main.name} draggable={false} />
  ) : null

  // Blue reads right-to-left into the centre; red reads left-to-right out of it.
  return team === 'BLUE' ? (
    <div className="card-side blue">
      {text}
      {face}
      {champ}
    </div>
  ) : (
    <div className="card-side red">
      {champ}
      {face}
      {text}
    </div>
  )
}

/** Per-lane win split. Says NO LINE rather than inventing one for an unranked fighter. */
function LaneChanceBar({ matchup }: { matchup: Matchup }) {
  const c = laneWinChance(matchup.blue, matchup.red)
  if (!c) return <span className="lane-noline">NO LINE</span>

  return (
    <div className="lane-chance">
      <span className="lane-pct blue">{c.bluePct}%</span>
      <div className="lane-chance-bar">
        <motion.div
          className="lane-chance-fill"
          initial={{ width: '50%' }}
          animate={{ width: `${c.bluePct}%` }}
          transition={{ delay: 0.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="lane-pct red">{c.redPct}%</span>
    </div>
  )
}

export function ScoreboardScreen({ result, onReroll, onBack }: Props) {
  const team = teamWinChance(result.matchups)

  useEffect(() => {
    bell()
    spawnConfetti(200)
    const t = window.setTimeout(airhorn, 500)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="screen scoreboard-screen">
      <motion.header
        className="card-header"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <h1 className="card-title">TONIGHT&rsquo;S FIGHT CARD</h1>
        <div className="card-teams">
          <span className="team-tag blue">BLUE SIDE</span>
          <span className="card-vs">VS</span>
          <span className="team-tag red">RED SIDE</span>
        </div>
      </motion.header>

      <TaleOfTheTape chance={team} />

      <div className="card-rows">
        {result.matchups.map((m, i) => (
          <motion.div
            className="card-row"
            key={m.lane}
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.09, type: 'spring', stiffness: 240, damping: 22 }}
          >
            <CardSide player={m.blue} team="BLUE" seed={result.seed} />

            <div className="card-lane">
              <span className="card-lane-name">{m.lane}</span>
              <LaneChanceBar matchup={m} />
              {m.curse && <span className="card-curse">{CURSE_BADGE[m.curse.type]}</span>}
            </div>

            <CardSide player={m.red} team="RED" seed={result.seed} />
          </motion.div>
        ))}
      </div>

      <motion.footer
        className="card-footer"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <button className="btn ghost" onClick={onBack} type="button">
          ← ROSTER
        </button>
        <button className="btn primary" onClick={onReroll} type="button">
          REROLL 🎲
        </button>
      </motion.footer>
    </div>
  )
}
