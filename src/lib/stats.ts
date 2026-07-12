import raw from '../data/playerStats.json'
import type { ChampStat, Matchup, Player, PlayerStats, RankInfo, StatsFile } from '../types'

/**
 * Live Riot data, baked in at build time by `npm run sync-stats`.
 * Everything here is optional — an empty file (the default) means the app runs exactly
 * as it did before, with no live stats anywhere.
 */
const FILE = raw as StatsFile

/** Fallback so champion icons still resolve if a sync has never been run. */
const DDRAGON_VERSION = FILE.ddragonVersion ?? '15.1.1'

export function statsFor(player: Player): PlayerStats | undefined {
  return FILE.players[player.id]
}

export function hasLiveStats(): boolean {
  return Object.keys(FILE.players).length > 0
}

export function championIcon(champ: ChampStat): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champ.key}.png`
}

export function profileIcon(iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${iconId}.png`
}

/* ── Rank ───────────────────────────────────────────────────── */

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'] as const
const DIVISIONS: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

/**
 * Collapse a rank to a single number so two players can be compared.
 * Each division is one step; the apex tiers sit above them and are separated by LP.
 */
export function rankScore(rank: RankInfo): number {
  const tierIdx = TIERS.indexOf(rank.tier as (typeof TIERS)[number])

  if (tierIdx >= 0) {
    const div = DIVISIONS[rank.division] ?? 0
    return tierIdx * 4 + div + rank.lp / 100
  }

  // Master and above have no divisions, so LP alone separates players within a tier.
  // Each apex tier gets its own band exactly 1.0 wide, with LP normalised into it and
  // CLAMPED — otherwise a 500 LP Master would outscore a fresh Grandmaster and quietly
  // invert the odds on the bout.
  const band = (base: number, lp: number, softCap: number) =>
    base + Math.min(lp, softCap) / softCap

  switch (rank.tier) {
    case 'MASTER':
      return band(28, rank.lp, 1000)
    case 'GRANDMASTER':
      return band(30, rank.lp, 1500)
    case 'CHALLENGER':
      return band(32, rank.lp, 2500)
    default:
      return 0 // unknown tier — treat as unranked rather than throwing
  }
}

export function formatRank(rank: RankInfo): string {
  const apex = !TIERS.includes(rank.tier as (typeof TIERS)[number])
  const tier = rank.tier.charAt(0) + rank.tier.slice(1).toLowerCase()
  return apex ? `${tier} ${rank.lp} LP` : `${tier} ${rank.division} · ${rank.lp} LP`
}

/** Short form for the tight scoreboard rows: 'G2', 'D4', 'CHAL'. */
export function shortRank(rank: RankInfo): string {
  const apex: Record<string, string> = { MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'CHAL' }
  if (apex[rank.tier]) return apex[rank.tier]
  const roman: Record<string, string> = { IV: '4', III: '3', II: '2', I: '1' }
  return rank.tier.charAt(0) + (roman[rank.division] ?? '')
}

export function rankClass(rank: RankInfo): string {
  return `tier-${rank.tier.toLowerCase()}`
}

export function winRate(champ: ChampStat): number | null {
  if (!champ.recent || champ.recent.games === 0) return null
  return Math.round((champ.recent.wins / champ.recent.games) * 100)
}

/** e.g. 431_204 → '431k'. Mastery points get big. */
export function formatMastery(points: number): string {
  if (points >= 1_000_000) return `${(points / 1_000_000).toFixed(1)}M`
  if (points >= 1_000) return `${Math.round(points / 1_000)}k`
  return String(points)
}

/* ── Rank-driven odds ───────────────────────────────────────── */

export type RealOdds = { blue: string; red: string; favorite: 'BLUE' | 'RED'; gap: number }

/**
 * Moneyline from the actual rank gap. The bigger the gulf, the more brutal the line.
 * Returns null if either player is unranked or unsynced — the caller then falls back
 * to the seeded fiction, so the odds board is never empty.
 */
export function oddsFromRank(blue: Player, red: Player): RealOdds | null {
  const b = statsFor(blue)?.rank
  const r = statsFor(red)?.rank
  if (!b || !r) return null

  const bScore = rankScore(b)
  const rScore = rankScore(r)
  const gap = Math.abs(bScore - rScore)

  // Dead heat — nobody's favoured, so let the fiction take over rather than
  // printing a meaningless -110/-110.
  if (gap < 0.25) return null

  const blueFavored = bScore > rScore
  const favLine = -Math.min(Math.round(110 + gap * 24), 2500)
  const dogLine = Math.min(Math.round(100 + gap * 30), 2500)

  return blueFavored
    ? { blue: String(favLine), red: `+${dogLine}`, favorite: 'BLUE', gap }
    : { blue: `+${dogLine}`, red: String(favLine), favorite: 'RED', gap }
}

/** Flavour text for a lopsided bout. */
export function mismatchTag(gap: number): string | null {
  if (gap >= 12) return 'ABSOLUTE MASSACRE'
  if (gap >= 8) return 'SEVERE MISMATCH'
  if (gap >= 5) return 'CLEAR FAVOURITE'
  return null
}

/* ── Win probability ────────────────────────────────────────── */

/**
 * Elo-style logistic. `rankScore` is measured in divisions, so the scale factor sets
 * how much one division is "worth":
 *
 *   1 division  (gap  1) → 55%
 *   1 full tier (gap  4) → 68%
 *   severe      (gap  8) → 82%
 *   massacre    (gap 13) → 92%
 *
 * Which is about right: being a tier better makes you a favourite, not a certainty.
 */
const ELO_SCALE = 12

export type LaneChance = { bluePct: number; redPct: number; gap: number }

/** null when either fighter is unranked — we refuse to invent a number. */
export function laneWinChance(blue: Player, red: Player): LaneChance | null {
  const b = statsFor(blue)?.rank
  const r = statsFor(red)?.rank
  if (!b || !r) return null

  const gap = rankScore(b) - rankScore(r)
  const p = 1 / (1 + Math.pow(10, -gap / ELO_SCALE))
  const bluePct = Math.round(p * 100)
  return { bluePct, redPct: 100 - bluePct, gap: Math.abs(gap) }
}

/** Turn a rankScore back into something readable, for showing a team's average. */
export function describeScore(score: number): string {
  if (score >= 32) return 'Challenger'
  if (score >= 30) return 'Grandmaster'
  if (score >= 28) return 'Master'

  const tierIdx = Math.max(0, Math.min(Math.floor(score / 4), TIERS.length - 1))
  const divIdx = Math.max(0, Math.min(Math.floor(score - tierIdx * 4), 3))
  const tier = TIERS[tierIdx]
  const roman = ['IV', 'III', 'II', 'I'][divIdx]
  return `${tier.charAt(0)}${tier.slice(1).toLowerCase()} ${roman}`
}

export type TeamSide = {
  /** Mean rankScore across that team's RANKED players. */
  avg: number
  label: string
  ranked: number
  size: number
  /** How many of those ranks came from flex rather than solo/duo. */
  flex: number
}

export type TeamChance = {
  bluePct: number
  redPct: number
  blue: TeamSide
  red: TeamSide
}

/**
 * Overall team projection, from AVERAGE TEAM RANK rather than from the head-to-head
 * lanes.
 *
 * Averaging the five lane probabilities would have thrown away real information: if a
 * Platinum player happens to be drawn against an unranked one, that lane goes NO LINE
 * and the Platinum player stops counting entirely — even though he plainly tells us
 * something about how strong his team is. Comparing team averages instead lets every
 * ranked player contribute, whoever they were unlucky enough to face.
 *
 * Unranked players are excluded from their team's average rather than assigned an
 * invented rank — so this is "the average of who we can measure", and the UI says how
 * many that was.
 */
export function teamWinChance(matchups: Matchup[]): TeamChance | null {
  const side = (players: Player[]): TeamSide | null => {
    const ranks = players
      .map((p) => statsFor(p)?.rank)
      .filter((r): r is RankInfo => Boolean(r))

    if (!ranks.length) return null // nobody on this team is ranked — no basis to judge

    const scores = ranks.map(rankScore)
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return {
      avg,
      label: describeScore(avg),
      ranked: ranks.length,
      size: players.length,
      flex: ranks.filter((r) => r.queue === 'FLEX').length,
    }
  }

  const blue = side(matchups.map((m) => m.blue))
  const red = side(matchups.map((m) => m.red))
  if (!blue || !red) return null

  const gap = blue.avg - red.avg
  const p = 1 / (1 + Math.pow(10, -gap / ELO_SCALE))
  const bluePct = Math.round(p * 100)

  return { bluePct, redPct: 100 - bluePct, blue, red }
}
