import type { MatchResult, Player, Team } from '../types'

/** CHOSEN: random teams, each team picks its own lanes. RANDOM: a full random roll (the classic In House roll). */
export type LanePolicy = 'CHOSEN' | 'RANDOM'
/** WHEEL: winners get what the wheel lands on. RANK: underdogs earn more, from average rank. */
export type PointsMode = 'WHEEL' | 'RANK'

export type LeagueRules = {
  /** One entry per match, in order. */
  schedule: LanePolicy[]
  /** Wheel segments, clockwise from the top. Used by any match that picks WHEEL. */
  wheel: number[]
  entryFee: number
  currency: string
  /** Prize per finishing place, 1st first. */
  payouts: number[]
}

export type LeagueMatch = {
  index: number
  lanes: LanePolicy
  /** Picked by the host before each match, before anyone knows the teams. */
  points: PointsMode
  seed: number
  startedAt: string
  /** WHEEL matches: the segment the wheel landed on. */
  wheel?: { index: number; value: number }
  /** Final sides — for a RANDOM roll these are read off the result, so curses count. */
  blue?: string[]
  red?: string[]
  /** What each side earns per player if it wins. Locked when the teams are drawn. */
  stake?: Record<Team, number>
  /** Lane assignment. CHOSEN matches only get one after the teams pick their lanes. */
  result?: MatchResult
  winner?: Team
}

export type League = {
  version: 1
  id: string
  name: string
  createdAt: string
  seed: number
  players: Player[]
  rules: LeagueRules
  matches: LeagueMatch[]
  /** Uploaded backdrop as a downscaled JPEG data URL. Absent = the shared default. */
  wallpaper?: string
}

export type MatchPhase = 'SPIN' | 'DRAW' | 'LANES' | 'PLAY' | 'DONE'

export type Standing = {
  player: Player
  points: number
  wins: number
  played: number
  /** Shared place: tied players have the same number. */
  place: number
  tied: boolean
  payout: number
}
