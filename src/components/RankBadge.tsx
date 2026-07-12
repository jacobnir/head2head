import { formatRank, rankClass, shortRank } from '../lib/stats'
import type { RankInfo } from '../types'

/**
 * Real ranked standing. `short` is for the tight scoreboard rows.
 *
 * Flex ranks are marked, not disguised — flex runs inflated relative to solo/duo, so a
 * "Platinum" from flex isn't quite the same animal as one from solo.
 */
export function RankBadge({ rank, short = false }: { rank?: RankInfo; short?: boolean }) {
  if (!rank) return <span className="rank-badge unranked">{short ? '—' : 'UNRANKED'}</span>

  const flex = rank.queue === 'FLEX'
  const total = rank.wins + rank.losses
  const wr = total ? Math.round((rank.wins / total) * 100) : null

  if (short) {
    return (
      <span
        className={`rank-badge ${rankClass(rank)} ${flex ? 'is-flex' : ''}`}
        title={`${formatRank(rank)} — ${flex ? 'Ranked Flex' : 'Solo/Duo'}`}
      >
        {shortRank(rank)}
        {flex && <sup className="flex-mark">F</sup>}
      </span>
    )
  }

  return (
    <span className={`rank-badge ${rankClass(rank)} ${flex ? 'is-flex' : ''}`}>
      {formatRank(rank)}
      {flex && <em className="flex-tag">FLEX</em>}
      {wr !== null && (
        <em className="rank-wl">
          {rank.wins}W {rank.losses}L · {wr}%
        </em>
      )}
    </span>
  )
}
