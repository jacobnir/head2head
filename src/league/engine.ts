import { randomize, REQUIRED_PLAYERS, TEAM_SIZE } from '../lib/randomize'
import { hashString, mulberry32, shuffle } from '../lib/rng'
import { teamWinChance } from '../lib/stats'
import { LANES, type Player, type Team } from '../types'
import type { League, LeagueMatch, LeagueRules, MatchPhase, PointsMode, Standing } from './types'

/** Tonight's format: pick-your-lane, full random, pick, full random, pick. */
export const DEFAULT_SCHEDULE: LeagueRules['schedule'] = ['CHOSEN', 'RANDOM', 'CHOSEN', 'RANDOM', 'CHOSEN']
export const DEFAULT_WHEEL = [1, 2, 3, 4, 5]

const ensure: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const SIDES: Team[] = ['BLUE', 'RED']

export function pot(league: League): number {
  return league.rules.entryFee * league.players.length
}

export function createLeague(input: {
  id: string; name: string; createdAt: string; seed: number; players: Player[]; rules: LeagueRules
}): League {
  const { players, rules } = input
  ensure(input.name.trim(), 'Give the league a name.')
  ensure(players.length === REQUIRED_PLAYERS, `Select exactly ${REQUIRED_PLAYERS} players.`)
  ensure(new Set(players.map((p) => p.id)).size === players.length, 'Each player can only enter once.')
  ensure(rules.schedule.length >= 1 && rules.schedule.every((s) => s === 'CHOSEN' || s === 'RANDOM'), 'Every match needs a lane rule.')
  ensure(rules.wheel.length >= 2, 'The wheel needs at least two segments.')
  ensure(rules.wheel.every((v) => Number.isInteger(v) && v > 0), 'Wheel segments must be whole numbers above zero.')
  ensure(Number.isFinite(rules.entryFee) && rules.entryFee >= 0, 'Enter a valid entry fee.')
  ensure(rules.payouts.every((v) => Number.isFinite(v) && v >= 0), 'Prizes must be zero or more.')
  ensure(rules.payouts.reduce((a, b) => a + b, 0) <= rules.entryFee * players.length,
    'The prizes add up to more than the pot.')
  return clone({ version: 1, ...input, matches: [] })
}

export function currentMatch(league: League): LeagueMatch | undefined {
  return league.matches[league.matches.length - 1]
}

export function phaseOf(match: LeagueMatch): MatchPhase {
  if (match.winner) return 'DONE'
  if (match.points === 'WHEEL' && !match.wheel) return 'SPIN'
  if (!match.blue) return 'DRAW'
  if (!match.result) return 'LANES'
  return 'PLAY'
}

export function isComplete(league: League): boolean {
  return league.matches.length === league.rules.schedule.length && league.matches.every((m) => m.winner)
}

/**
 * Opens the next match with the points mode the host picked for it. The seed comes from
 * the league seed, so undo + redo redraws the same teams.
 */
export function startMatch(league: League, now: string, points: PointsMode): League {
  const last = currentMatch(league)
  ensure(!last || last.winner, 'Finish the current match first.')
  const index = league.matches.length
  ensure(index < league.rules.schedule.length, 'Every match has been played.')
  ensure(points === 'WHEEL' || points === 'RANK', 'Choose how this match awards points.')
  const match: LeagueMatch = {
    index, lanes: league.rules.schedule[index], points, startedAt: now,
    seed: hashString(`${league.seed}:match:${index}`),
  }
  return { ...league, matches: [...league.matches, match] }
}

function updateCurrent(league: League, phase: MatchPhase, change: (m: LeagueMatch) => LeagueMatch): League {
  const match = currentMatch(league)
  ensure(match, 'Start a match first.')
  ensure(phaseOf(match) === phase, `This match is not waiting for ${phase.toLowerCase()}.`)
  return { ...league, matches: [...league.matches.slice(0, -1), change(match)] }
}

export function wheelIndex(seed: number, segments: number): number {
  return Math.floor(mulberry32(hashString(`${seed}:wheel`))() * segments)
}

export function spinWheel(league: League): League {
  ensure(currentMatch(league)?.points === 'WHEEL', 'This match awards points by rank, not the wheel.')
  return updateCurrent(league, 'SPIN', (m) => {
    const index = wheelIndex(m.seed, league.rules.wheel.length)
    return { ...m, wheel: { index, value: league.rules.wheel[index] } }
  })
}

/**
 * Win-prediction points: the favourite earns fewer, the underdog more, and an even
 * match pays 5 each. The two stakes always add up to 10.
 */
export function stakeFromChance(bluePct: number): Record<Team, number> {
  const favouritePct = Math.max(bluePct, 100 - bluePct)
  const favourite = Math.min(5, Math.max(1, Math.round((100 - favouritePct) / 10)))
  return bluePct >= 50 ? { BLUE: favourite, RED: 10 - favourite } : { BLUE: 10 - favourite, RED: favourite }
}

function stakeFor(match: LeagueMatch, blue: Player[], red: Player[]): Record<Team, number> {
  if (match.points === 'WHEEL') return { BLUE: match.wheel!.value, RED: match.wheel!.value }
  // teamWinChance only reads who is on each side; the lane pairing is irrelevant here.
  const chance = teamWinChance(LANES.map((lane, i) => ({ lane, blue: blue[i], red: red[i] })))
  return chance ? stakeFromChance(chance.bluePct) : { BLUE: 5, RED: 5 }
}

export function teamWinPct(blue: Player[], red: Player[]): number | null {
  return teamWinChance(LANES.map((lane, i) => ({ lane, blue: blue[i], red: red[i] })))?.bluePct ?? null
}

const byId = (league: League, ids: string[]) => ids.map((id) => league.players.find((p) => p.id === id)!)

export function drawTeams(league: League): League {
  return updateCurrent(league, 'DRAW', (m) => {
    if (m.lanes === 'RANDOM') {
      // A full random roll, curses and all. Sides are read off the FINAL card.
      const result = randomize(league.players, m.seed)
      const blue = result.matchups.map((x) => x.blue)
      const red = result.matchups.map((x) => x.red)
      return { ...m, result, blue: blue.map((p) => p.id), red: red.map((p) => p.id), stake: stakeFor(m, blue, red) }
    }
    const pool = shuffle(league.players, mulberry32(m.seed))
    const blue = pool.slice(0, TEAM_SIZE)
    const red = pool.slice(TEAM_SIZE)
    return { ...m, blue: blue.map((p) => p.id), red: red.map((p) => p.id), stake: stakeFor(m, blue, red) }
  })
}

/** Orders are TOP, JUNGLE, MID, ADC, SUPPORT — as each team decided. Re-assignable until a winner is set. */
export function assignLanes(league: League, blueOrder: string[], redOrder: string[]): League {
  const match = currentMatch(league)
  ensure(match && match.lanes === 'CHOSEN', 'Only pick-your-lane matches take a lane assignment.')
  ensure(!match.winner && match.blue && match.red, 'Draw the teams first.')
  const same = (order: string[], team: string[]) =>
    order.length === TEAM_SIZE && new Set(order).size === TEAM_SIZE && order.every((id) => team.includes(id))
  ensure(same(blueOrder, match.blue) && same(redOrder, match.red), 'Give every player on each team exactly one lane.')
  const blue = byId(league, blueOrder)
  const red = byId(league, redOrder)
  const result = { seed: match.seed, matchups: LANES.map((lane, i) => ({ lane, blue: blue[i], red: red[i] })) }
  return { ...league, matches: [...league.matches.slice(0, -1), { ...match, blue: blueOrder, red: redOrder, result }] }
}

export function recordWinner(league: League, winner: Team): League {
  ensure(SIDES.includes(winner), 'Pick blue or red.')
  return updateCurrent(league, 'PLAY', (m) => ({ ...m, winner }))
}

/** Steps back once: un-records the last result, or abandons an unfinished match. */
export function undo(league: League): League {
  const match = currentMatch(league)
  ensure(match, 'Nothing to undo.')
  if (match.winner) {
    const rest = { ...match }
    delete rest.winner
    return { ...league, matches: [...league.matches.slice(0, -1), rest] }
  }
  return { ...league, matches: league.matches.slice(0, -1) }
}

/**
 * Equal points share a place. Prize money for the places a tied group covers is pooled
 * and split evenly — two tied for 1st split 1st + 2nd.
 */
export function standings(league: League): Standing[] {
  const rows = league.players.map((player) => ({ player, points: 0, wins: 0, played: 0 }))
  const row = (id: string) => rows.find((r) => r.player.id === id)!
  for (const m of league.matches) {
    if (!m.winner || !m.blue || !m.red || !m.stake) continue
    for (const side of SIDES) {
      for (const id of side === 'BLUE' ? m.blue : m.red) {
        const r = row(id)
        r.played++
        if (side === m.winner) { r.wins++; r.points += m.stake[side] }
      }
    }
  }
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.player.name.localeCompare(b.player.name))
  const out: Standing[] = []
  for (let start = 0; start < rows.length;) {
    let end = start
    while (end < rows.length && rows[end].points === rows[start].points) end++
    const share = league.rules.payouts.slice(start, end).reduce((a, b) => a + b, 0) / (end - start)
    for (let i = start; i < end; i++) {
      out.push({ ...rows[i], place: start + 1, tied: end - start > 1, payout: Math.round(share * 100) / 100 })
    }
    start = end
  }
  return out
}
