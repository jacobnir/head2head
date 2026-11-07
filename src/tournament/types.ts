import type { MatchResult, Player } from '../types'

export type BestOf = 1 | 3 | 5
export type TournamentRules = {
  format: 'single' | 'double'
  formation: 'manual' | 'random' | 'balanced'
  roles: 'chosen' | 'random'
  roundsBestOf: BestOf
  finalBestOf: BestOf
}

export type TournamentPlayer = Player & {
  /** Presentation data captured at setup; subsequent Riot syncs cannot change an event. */
  strength?: number
}

export type TournamentTeam = {
  id: string
  name: string
  color: string
  /** In default TOP, JUNGLE, MID, ADC, SUPPORT order. */
  players: TournamentPlayer[]
}

export type BracketSource =
  | { kind: 'seed'; index: number }
  | { kind: 'winner' | 'loser'; seriesId: string }

export type TournamentGame = {
  id: string
  blueTeamId: string
  redTeamId: string
  result: MatchResult
  startedAt: string
  winnerId?: string
}

export type TournamentSeries = {
  id: string
  bracket: 'upper' | 'lower' | 'final'
  round: number
  label: string
  sources: [BracketSource, BracketSource]
  bestOf: BestOf
  reset?: boolean
  /** Kept after undo so prediction locks never reopen. */
  startedAt?: string
  games: TournamentGame[]
}

export type Prediction = {
  id: string
  name: string
  championId?: string
  series: Record<string, string>
}

export type Tournament = {
  version: 1
  id: string
  name: string
  createdAt: string
  startedAt?: string
  rules: TournamentRules
  prize?: { amount: number; currency: string }
  teams: TournamentTeam[]
  seed: number
  seedOrder: string[]
  series: TournamentSeries[]
  predictions: Prediction[]
}

export type SeriesState = {
  series: TournamentSeries
  teams: [string | null, string | null]
  status: 'waiting' | 'bye' | 'ready' | 'playing' | 'complete' | 'skipped'
  score: [number, number]
  winnerId: string | null
  loserId: string | null
}

export type TournamentState = {
  series: SeriesState[]
  championId: string | null
  losses: Record<string, number>
}
