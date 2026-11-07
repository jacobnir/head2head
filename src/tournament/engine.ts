import { hashString, mulberry32, shuffle } from '../lib/rng'
import { LANES } from '../types'
import type {
  BestOf, BracketSource, Prediction, SeriesState, Tournament, TournamentGame,
  TournamentPlayer, TournamentRules, TournamentSeries, TournamentState, TournamentTeam,
} from './types'

const winner = (seriesId: string): BracketSource => ({ kind: 'winner', seriesId })
const loser = (seriesId: string): BracketSource => ({ kind: 'loser', seriesId })
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const ensure: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

/** Mirrored seeding spreads byes across the opening round instead of creating empty regions. */
function seedPositions(size: number): number[] {
  let positions = [1, 2]
  while (positions.length < size) {
    const sum = positions.length * 2 + 1
    positions = positions.flatMap((seed) => [seed, sum - seed])
  }
  return positions.map((seed) => seed - 1)
}

export function createBracket(teamCount: number, rules: TournamentRules): TournamentSeries[] {
  ensure(Number.isSafeInteger(teamCount) && teamCount >= 2, 'A tournament needs at least two teams.')
  const size = 2 ** Math.ceil(Math.log2(teamCount))
  const rounds = Math.log2(size)
  const positions = seedPositions(size)
  const all: TournamentSeries[] = []
  const upper: string[][] = []
  const add = (id: string, bracket: TournamentSeries['bracket'], round: number,
    label: string, sources: [BracketSource, BracketSource], bestOf: BestOf, reset = false) => {
    all.push({ id, bracket, round, label, sources, bestOf, ...(reset ? { reset: true } : {}), games: [] })
    return id
  }
  for (let r = 0; r < rounds; r++) {
    const ids: string[] = []
    const count = size / 2 ** (r + 1)
    for (let i = 0; i < count; i++) {
      const sources: [BracketSource, BracketSource] = r === 0
        ? [{ kind: 'seed', index: positions[i * 2] }, { kind: 'seed', index: positions[i * 2 + 1] }]
        : [winner(upper[r - 1][i * 2]), winner(upper[r - 1][i * 2 + 1])]
      const isFinal = r === rounds - 1
      ids.push(add(`U${r + 1}-${i + 1}`, 'upper', r + 1,
        isFinal ? (rules.format === 'single' ? 'Championship final' : 'Upper final') : `Upper round ${r + 1}`,
        sources, isFinal && rules.format === 'single' ? rules.finalBestOf : rules.roundsBestOf))
    }
    upper.push(ids)
  }
  if (rules.format === 'single') return all

  let lower: string[] = []
  if (rounds > 1) {
    for (let i = 0; i < size / 4; i++) {
      lower.push(add(`L1-${i + 1}`, 'lower', 1, 'Lower round 1',
        [loser(upper[0][i * 2]), loser(upper[0][i * 2 + 1])], rules.roundsBestOf))
    }
    for (let r = 1; r < rounds; r++) {
      // Cross adjacent upper feeds to avoid an immediate rematch after an upper loss.
      lower = lower.map((id, i) => add(`L${r * 2}-${i + 1}`, 'lower', r * 2,
        r === rounds - 1 ? 'Lower final' : `Lower round ${r * 2}`,
        [winner(id), loser(upper[r][lower.length > 1 ? i ^ 1 : i])], rules.roundsBestOf))
      if (r < rounds - 1) {
        const previous = lower
        lower = []
        for (let i = 0; i < previous.length / 2; i++) {
          lower.push(add(`L${r * 2 + 1}-${i + 1}`, 'lower', r * 2 + 1, `Lower round ${r * 2 + 1}`,
            [winner(previous[i * 2]), winner(previous[i * 2 + 1])], rules.roundsBestOf))
        }
      }
    }
  }
  const upperFinal = upper[rounds - 1][0]
  const lowerFinal = lower.length ? winner(lower[0]) : loser(upperFinal)
  add('GF', 'final', 1, 'Grand final', [winner(upperFinal), lowerFinal], rules.finalBestOf)
  add('RESET', 'final', 2, 'Grand final · reset', [winner(upperFinal), lowerFinal], rules.finalBestOf, true)
  return all
}

export function validateTeams(teams: TournamentTeam[]) {
  ensure(teams.length >= 2, 'Create at least two teams.')
  ensure(new Set(teams.map((t) => t.id)).size === teams.length, 'Team IDs must be unique.')
  const ids = new Set<string>()
  for (const team of teams) {
    ensure(team.id && team.name.trim(), 'Every team needs a name and ID.')
    ensure(/^#[0-9a-f]{6}$/i.test(team.color), 'Choose a valid team colour.')
    ensure(team.players.length === 5, `${team.name} needs exactly five players.`)
    for (const player of team.players) {
      ensure(player.id && player.name.trim(), 'Every player needs a name and ID.')
      ensure(!ids.has(player.id), `${player.name} is assigned more than once.`)
      ids.add(player.id)
    }
  }
}

export function formTeams(players: TournamentPlayer[], count: number, method: 'random' | 'balanced', seed: number): TournamentPlayer[][] {
  ensure(Number.isInteger(count) && count >= 2 && players.length === count * 5, `Select exactly ${count * 5} players.`)
  ensure(new Set(players.map((p) => p.id)).size === players.length, 'Players must be unique.')
  const pool = shuffle(players, mulberry32(seed))
  if (method === 'balanced') {
    ensure(pool.every((p) => Number.isFinite(p.strength) && p.strength! >= 0), 'Provide a balancing estimate for every unranked player.')
    pool.sort((a, b) => b.strength! - a.strength!)
  }
  const teams: TournamentPlayer[][] = Array.from({ length: count }, () => [])
  pool.forEach((p, index) => {
    const row = Math.floor(index / count)
    const column = index % count
    teams[method === 'balanced' && row % 2 ? count - 1 - column : column].push(clone(p))
  })
  return teams
}

export function createTournament(input: {
  id: string; name: string; teams: TournamentTeam[]; rules: TournamentRules;
  seed: number; createdAt: string; prize?: Tournament['prize'];
}): Tournament {
  validateTeams(input.teams)
  ensure(input.name.trim(), 'Give your tournament a name.')
  ensure([1, 3, 5].includes(input.rules.roundsBestOf) && [1, 3, 5].includes(input.rules.finalBestOf), 'Series must be BO1, BO3, or BO5.')
  if (input.prize) ensure(Number.isFinite(input.prize.amount) && input.prize.amount >= 0 && input.prize.currency.trim(), 'Enter a valid prize amount and currency.')
  return clone({ ...input, version: 1, seedOrder: shuffle(input.teams.map((t) => t.id), mulberry32(input.seed)),
    series: createBracket(input.teams.length, input.rules), predictions: [] })
}

/** All progression is derived in topological order. An unresolved source is never a bye. */
export function tournamentState(tournament: Tournament): TournamentState {
  const states: SeriesState[] = []
  const byId = new Map<string, SeriesState>()
  const losses: Record<string, number> = Object.fromEntries(tournament.teams.map((t) => [t.id, 0]))
  for (const series of tournament.series) {
    const resolved = series.sources.map((source) => {
      if (source.kind === 'seed') return { ready: true, team: tournament.seedOrder[source.index] ?? null }
      const parent = byId.get(source.seriesId)
      return { ready: !!parent && ['complete', 'bye'].includes(parent.status),
        team: parent ? (source.kind === 'winner' ? parent.winnerId : parent.loserId) : null }
    })
    const teams: SeriesState['teams'] = [resolved[0].team, resolved[1].team]
    const state: SeriesState = { series, teams, status: 'waiting', score: [0, 0], winnerId: null, loserId: null }
    const final = byId.get('GF')
    const resetNotNeeded = series.reset && final?.status === 'complete' && final.winnerId === final.teams[0]
    const resetPending = series.reset && final?.status !== 'complete'
    if (resetNotNeeded) state.status = 'skipped'
    else if (!resetPending && resolved.every((s) => s.ready)) {
      if (!teams[0] || !teams[1]) {
        state.status = 'bye'
        state.winnerId = teams[0] ?? teams[1]
      } else {
        state.score = teams.map((id) => series.games.filter((game) => game.winnerId === id).length) as [number, number]
        const target = Math.floor(series.bestOf / 2) + 1
        const winIndex = state.score.findIndex((score) => score >= target)
        if (winIndex !== -1) {
          state.status = 'complete'
          state.winnerId = teams[winIndex]
          state.loserId = teams[1 - winIndex]
          losses[state.loserId!]++
        } else state.status = series.games.length ? 'playing' : 'ready'
      }
    }
    states.push(state)
    byId.set(series.id, state)
  }
  const final = tournament.rules.format === 'single' ? states[states.length - 1] : byId.get('GF')!
  const reset = byId.get('RESET')
  const championId = final.status !== 'complete' ? null
    : tournament.rules.format === 'single' || final.winnerId === final.teams[0]
      ? final.winnerId : reset?.winnerId ?? null
  return { series: states, losses, championId }
}

export function startTournament(tournament: Tournament, now: string): Tournament {
  ensure(!tournament.startedAt, 'This event has already started.')
  validateTeams(tournament.teams)
  return { ...tournament, startedAt: now }
}

export function startGame(tournament: Tournament, seriesId: string, now: string,
  chosen?: { blue: string[]; red: string[] }): Tournament {
  ensure(tournament.startedAt, 'Start the tournament first.')
  const state = tournamentState(tournament).series.find((s) => s.series.id === seriesId)
  ensure(state && ['ready', 'playing'].includes(state.status), 'This series is not ready.')
  ensure(!state.series.games.some((g) => !g.winnerId), 'Finish the current game first.')
  const gameIndex = state.series.games.length
  const blueTeamId = state.teams[gameIndex % 2]!
  const redTeamId = state.teams[1 - gameIndex % 2]!
  const blue = tournament.teams.find((t) => t.id === blueTeamId)!
  const red = tournament.teams.find((t) => t.id === redTeamId)!
  const seed = hashString(`${tournament.seed}:${seriesId}:${gameIndex}`)
  const rand = mulberry32(seed)
  const ordered = (team: TournamentTeam, ids?: string[]) => {
    if (tournament.rules.roles === 'random') return shuffle(team.players, rand)
    const order = ids ?? team.players.map((p) => p.id)
    ensure(order.length === 5 && new Set(order).size === 5 && order.every((id) => team.players.some((p) => p.id === id)), 'Assign each teammate to exactly one role.')
    return order.map((id) => team.players.find((p) => p.id === id)!)
  }
  const bluePlayers = ordered(blue, chosen?.blue)
  const redPlayers = ordered(red, chosen?.red)
  const game: TournamentGame = {
    id: `${seriesId}-G${gameIndex + 1}`, blueTeamId, redTeamId, startedAt: now,
    result: { seed, matchups: LANES.map((lane, i) => ({ lane, blue: bluePlayers[i], red: redPlayers[i] })) },
  }
  return { ...tournament, series: tournament.series.map((s) => s.id === seriesId
    ? { ...s, startedAt: s.startedAt ?? now, games: [...s.games, game] } : s) }
}

/** RESET additionally depends on the grand final's outcome despite having shared team feeds. */
export function descendants(tournament: Tournament, seriesId: string): Set<string> {
  const found = new Set<string>()
  for (const series of tournament.series) {
    if ((series.reset && (seriesId === 'GF' || found.has('GF'))) || series.sources.some((s) =>
      s.kind !== 'seed' && (s.seriesId === seriesId || found.has(s.seriesId)))) found.add(series.id)
  }
  return found
}

function assertEditable(tournament: Tournament, seriesId: string) {
  const downstream = descendants(tournament, seriesId)
  ensure(!tournament.series.some((s) => downstream.has(s.id) && s.games.length),
    'Undo dependent games first, starting with the latest round.')
}

export function recordWinner(tournament: Tournament, seriesId: string, gameId: string, winnerId: string): Tournament {
  const state = tournamentState(tournament).series.find((s) => s.series.id === seriesId)
  ensure(state && state.teams.includes(winnerId), 'Choose a team in this series.')
  const game = state.series.games.find((g) => g.id === gameId)
  ensure(game, 'Start the game before recording a result.')
  ensure(state.series.games[state.series.games.length - 1].id === gameId, 'Undo later games in this series first.')
  assertEditable(tournament, seriesId)
  return { ...tournament, series: tournament.series.map((s) => s.id === seriesId
    ? { ...s, games: s.games.map((g) => g.id === gameId ? { ...g, winnerId } : g) } : s) }
}

export function undoGame(tournament: Tournament, seriesId: string): Tournament {
  assertEditable(tournament, seriesId)
  const series = tournament.series.find((s) => s.id === seriesId)
  ensure(series?.games.length, 'There is no game to undo.')
  return { ...tournament, series: tournament.series.map((s) => s.id === seriesId
    ? { ...s, games: s.games.slice(0, -1) } : s) }
}

export function savePrediction(tournament: Tournament, prediction: Prediction): Tournament {
  ensure(prediction.id && prediction.name.trim(), 'Enter a predictor name.')
  const previous = tournament.predictions.find((p) => p.id === prediction.id)
  if (tournament.startedAt) ensure(previous?.championId === prediction.championId, 'Champion picks locked when the event started.')
  if (prediction.championId) ensure(tournament.teams.some((t) => t.id === prediction.championId), 'Choose a valid champion.')
  const state = tournamentState(tournament)
  for (const id of new Set([...Object.keys(previous?.series ?? {}), ...Object.keys(prediction.series)])) {
    const s = state.series.find((s) => s.series.id === id)
    ensure(s, 'Unknown series in prediction.')
    const before = previous?.series[id]
    const after = prediction.series[id]
    if (before === after) continue
    ensure(!s.series.startedAt, 'This series has started; its picks are locked.')
    ensure(s.status === 'ready' && (!after || s.teams.includes(after)), 'Pick one of the confirmed opponents in a ready series.')
  }
  return { ...tournament, predictions: [...tournament.predictions.filter((p) => p.id !== prediction.id), clone(prediction)] }
}

export function predictionStandings(tournament: Tournament) {
  const state = tournamentState(tournament)
  const rows = tournament.predictions.map((p) => ({ ...p, points:
    (state.championId && state.championId === p.championId ? 3 : 0) +
    state.series.filter((s) => s.status === 'complete' && p.series[s.series.id] === s.winnerId).length,
  })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  return rows.map((row, i) => ({ ...row, position: rows.findIndex((p) => p.points === rows[i].points) + 1 }))
}
