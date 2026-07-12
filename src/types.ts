export type Player = {
  id: string
  name: string
  /** Shown on the fight card: DAVE "The Feeder". Optional — a random hype tag is used if absent. */
  nickname?: string
  img: string
  /**
   * Riot ID, as `GameName#TAG` (the new format — NOT the old summoner name).
   * Find it in the client, top-right of your profile.
   * Optional: without it the player simply has no live stats, and everything still works.
   */
  riotId?: string
  /** Platform routing, e.g. 'euw1'. Defaults to DEFAULT_PLATFORM if omitted. */
  platform?: string
}

export const LANES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const
export type Lane = (typeof LANES)[number]

export type Team = 'BLUE' | 'RED'

export type CurseType = 'SWAP' | 'EARTHQUAKE' | 'CURSED_LANE'

/**
 * A curse that fired on a lane. `before` is what the pairing looked like BEFORE the
 * curse mutated it — the reveal shows `before`, plays the curse, then lands on the
 * matchup's real (final) blue/red. CURSED_LANE is cosmetic and carries no `before`.
 */
export type Curse = {
  type: CurseType
  before?: { blue: Player; red: Player }
}

export type Matchup = {
  lane: Lane
  blue: Player
  red: Player
  curse?: Curse
}

export type Stat = { label: string; value: number }

export type Odds = {
  blue: string
  red: string
  favorite: Team
  /** True when derived from actual ranked data; false when it's seeded fiction. */
  real: boolean
  /** Rank gap that produced the line. Only set when `real`. */
  gap?: number
}

export type MatchResult = {
  seed: number
  matchups: Matchup[]
}

/* ── Live Riot data (written by `npm run sync-stats`) ───────── */

export type ChampStat = {
  /** Data Dragon id, e.g. 'MonkeyKing' — used to build the icon URL. */
  key: string
  /** Display name, e.g. 'Wukong'. */
  name: string
  masteryPoints: number
  masteryLevel: number
  /** From recent match history. Absent if they haven't played it lately. */
  recent?: { games: number; wins: number }
}

export type RankInfo = {
  tier: string // IRON … CHALLENGER
  division: string // IV … I ('' for master+)
  lp: number
  wins: number
  losses: number
  /**
   * Which ladder this came from. Solo/duo is preferred; flex is the fallback for people
   * who don't queue solo. Flex tends to run inflated, so it's labelled in the UI rather
   * than passed off as equivalent.
   */
  queue: 'SOLO' | 'FLEX'
}

export type PlayerStats = {
  riotId: string
  platform: string
  level?: number
  profileIcon?: number
  rank?: RankInfo // absent = unranked
  topChamps: ChampStat[]
  /** ISO timestamp of the sync that produced this. */
  syncedAt: string
}

export type StatsFile = {
  /** Data Dragon version the icon URLs are built against. */
  ddragonVersion: string | null
  players: Record<string, PlayerStats>
}

