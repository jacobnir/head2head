import { createBracket, startGame, recordWinner, validateTeams, tournamentState } from './engine'
import type { Tournament } from './types'

export const TOURNAMENT_STORAGE_KEY = 'fightnight.tournaments.v1'
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export type Library = { version: 1; events: Tournament[] }
export type LoadedLibrary = { library: Library; raw: string | null; error: string | null }

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
function object(value: unknown): asserts value is Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object in tournament save.')
}
function string(value: unknown): asserts value is string {
  assert(typeof value === 'string', 'Expected text in tournament save.')
}
function timestamp(value: unknown) {
  string(value)
  assert(Number.isFinite(Date.parse(value)), 'Invalid saved timestamp.')
}
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => sameJson(value, b[i]))
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && sameJson(left[key], right[key]))
}
function player(value: unknown) {
  object(value)
  string(value.id); string(value.name); string(value.img)
  for (const field of ['nickname', 'riotId', 'platform']) if (value[field] !== undefined) string(value[field])
  if (value.strength !== undefined) assert(typeof value.strength === 'number' && Number.isFinite(value.strength) && value.strength >= 0, 'Invalid balancing estimate.')
  if (value.statsSnapshot != null) {
    const stats = value.statsSnapshot
    object(stats)
    string(stats.riotId); string(stats.platform); timestamp(stats.syncedAt)
    for (const field of ['level', 'profileIcon']) if (stats[field] !== undefined)
      assert(typeof stats[field] === 'number' && Number.isFinite(stats[field]), 'Invalid player stats snapshot.')
    assert(Array.isArray(stats.topChamps), 'Invalid champion snapshot.')
    for (const champ of stats.topChamps) {
      object(champ); string(champ.key); string(champ.name)
      assert(typeof champ.masteryPoints === 'number' && Number.isFinite(champ.masteryPoints) &&
        typeof champ.masteryLevel === 'number' && Number.isFinite(champ.masteryLevel), 'Invalid mastery snapshot.')
      if (champ.recent !== undefined) {
        object(champ.recent)
        assert(typeof champ.recent.games === 'number' && Number.isFinite(champ.recent.games) &&
          typeof champ.recent.wins === 'number' && Number.isFinite(champ.recent.wins), 'Invalid recent champion stats.')
      }
    }
    if (stats.rank !== undefined) {
      object(stats.rank)
      string(stats.rank.tier); string(stats.rank.division)
      assert(['SOLO', 'FLEX'].includes(String(stats.rank.queue)), 'Invalid ranked queue.')
      for (const key of ['lp', 'wins', 'losses']) assert(typeof stats.rank[key] === 'number' && Number.isFinite(stats.rank[key]), 'Invalid rank snapshot.')
    }
  }
}

/** Validate structure AND replay actual games against the engine before accepting a file. */
export function validateTournament(value: unknown): Tournament {
  object(value)
  assert(value.version === 1, 'Unsupported tournament version.')
  string(value.id); string(value.name); timestamp(value.createdAt)
  assert(value.id.trim() && value.name.trim(), 'Tournament ID and name are required.')
  if (value.startedAt !== undefined) timestamp(value.startedAt)
  assert(Number.isInteger(value.seed) && Number(value.seed) >= 0 && Number(value.seed) <= 0xffffffff, 'Invalid draw seed.')
  object(value.rules)
  assert(['single', 'double'].includes(String(value.rules.format)), 'Invalid tournament format.')
  assert(['manual', 'random', 'balanced'].includes(String(value.rules.formation)), 'Invalid team formation.')
  assert(['chosen', 'random'].includes(String(value.rules.roles)), 'Invalid role setting.')
  assert([1, 3, 5].includes(Number(value.rules.roundsBestOf)) && [1, 3, 5].includes(Number(value.rules.finalBestOf)) &&
    typeof value.rules.roundsBestOf === 'number' && typeof value.rules.finalBestOf === 'number', 'Invalid series length.')
  if (value.prize !== undefined) {
    object(value.prize); string(value.prize.currency)
    assert(typeof value.prize.amount === 'number' && Number.isFinite(value.prize.amount) && value.prize.amount >= 0 && value.prize.currency.trim(), 'Invalid prize display.')
  }
  assert(Array.isArray(value.teams), 'Missing teams.')
  for (const team of value.teams) {
    object(team); string(team.id); string(team.name); string(team.color)
    assert(Array.isArray(team.players), 'Missing team roster.')
    team.players.forEach(player)
  }
  const t = value as unknown as Tournament
  validateTeams(t.teams)
  const teamIds = new Set(t.teams.map((t) => t.id))
  assert(Array.isArray(t.seedOrder) && t.seedOrder.length === teamIds.size && new Set(t.seedOrder).size === teamIds.size &&
    t.seedOrder.every((id) => teamIds.has(id)), 'Seed order must contain every team once.')
  const expected = createBracket(t.teams.length, t.rules)
  assert(Array.isArray(t.series) && t.series.length === expected.length, 'Invalid bracket size.')
  for (let i = 0; i < expected.length; i++) {
    const actual = t.series[i]
    object(actual)
    const reference = expected[i]
    for (const key of ['id', 'bracket', 'round', 'label', 'bestOf', 'reset'] as const)
      assert(actual[key] === reference[key], 'Saved bracket does not match its rules.')
    assert(sameJson(actual.sources, reference.sources), 'Invalid bracket feed.')
    assert(Array.isArray(actual.games), 'Missing saved games.')
    if (actual.startedAt !== undefined) timestamp(actual.startedAt)
    assert(!actual.startedAt || t.startedAt, 'A draft event cannot contain started series.')
    assert(actual.games.length <= actual.bestOf && (!actual.games.length || actual.startedAt), 'Invalid series game count.')
  }
  let replay: Tournament = { ...t, series: expected }
  for (const series of t.series) {
    for (const game of series.games) {
      object(game); timestamp(game.startedAt)
      object(game.result)
      assert(Array.isArray(game.result.matchups) && game.result.matchups.length === 5, 'A saved game needs five lanes.')
      for (const matchup of game.result.matchups) {
        object(matchup); player(matchup.blue); player(matchup.red)
        assert(matchup.curse === undefined, 'Tournament games cannot contain curses.')
      }
      replay = startGame(replay, series.id, game.startedAt, {
        blue: game.result.matchups.map((m) => m.blue.id), red: game.result.matchups.map((m) => m.red.id),
      })
      const replayGames = replay.series.find((s) => s.id === series.id)!.games
      const generated = replayGames[replayGames.length - 1]
      assert(game.id === generated.id && game.blueTeamId === generated.blueTeamId && game.redTeamId === generated.redTeamId &&
        sameJson(game.result, generated.result), 'Saved assignment does not match the locked teams and draw.')
      if (game.winnerId !== undefined) {
        string(game.winnerId)
        replay = recordWinner(replay, series.id, game.id, game.winnerId)
      }
    }
  }
  assert(Array.isArray(t.predictions), 'Missing predictions.')
  const predictorIds = new Set<string>()
  for (const prediction of t.predictions) {
    object(prediction); string(prediction.id); string(prediction.name); object(prediction.series)
    assert(prediction.id.trim() && prediction.name.trim() && !predictorIds.has(prediction.id), 'Invalid or duplicate predictor.')
    predictorIds.add(prediction.id)
    assert(prediction.championId === undefined || teamIds.has(prediction.championId), 'Unknown predicted champion.')
    for (const [id, pick] of Object.entries(prediction.series)) {
      assert(expected.some((s) => s.id === id) && teamIds.has(pick), 'Unknown predicted team or series.')
    }
  }
  tournamentState(t)
  return t
}

export function parseLibrary(raw: string): Library {
  const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''))
  object(value)
  assert(value.version === 1 && Array.isArray(value.events), 'Choose an In House tournament export (version 1).')
  const events = value.events.map(validateTournament)
  assert(new Set(events.map((t) => t.id)).size === events.length, 'Duplicate event IDs in export.')
  return { version: 1, events }
}

export function readLibrary(storage: StoragePort): LoadedLibrary {
  let raw: string | null = null
  try {
    raw = storage.getItem(TOURNAMENT_STORAGE_KEY)
    return { library: raw === null ? { version: 1, events: [] } : parseLibrary(raw), raw, error: null }
  } catch (error) {
    return { library: { version: 1, events: [] }, raw, error: error instanceof Error ? error.message : 'Tournament storage is unavailable.' }
  }
}

/** Compare before writing: another host tab must not silently overwrite newer scores. */
export function writeLibrary(storage: StoragePort, library: Library, expectedRaw: string | null): string {
  const current = readLibrary(storage)
  assert(!current.error, 'Existing save is unreadable. Export it and import a recovery file first.')
  assert(current.raw === expectedRaw, 'This save changed in another tab. Reload before continuing.')
  const raw = JSON.stringify(library)
  parseLibrary(raw)
  storage.setItem(TOURNAMENT_STORAGE_KEY, raw)
  return raw
}

export function recoverLibrary(storage: StoragePort, library: Library, expectedRaw: string | null): string {
  assert(expectedRaw !== null && storage.getItem(TOURNAMENT_STORAGE_KEY) === expectedRaw, 'Reload before recovering this save.')
  const raw = JSON.stringify(library)
  parseLibrary(raw)
  // If making the backup fails, do not replace the original.
  storage.setItem(`${TOURNAMENT_STORAGE_KEY}.recovery.${Date.now()}`, expectedRaw)
  storage.setItem(TOURNAMENT_STORAGE_KEY, raw)
  return raw
}
