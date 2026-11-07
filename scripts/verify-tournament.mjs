import assert from 'node:assert/strict'
import {
  createTournament, formTeams, tournamentState, startTournament, startGame, recordWinner,
  undoGame, savePrediction, predictionStandings, descendants,
} from '../tmp/tournament.mjs'
import { parseLibrary, readLibrary, writeLibrary, recoverLibrary, TOURNAMENT_STORAGE_KEY } from '../tmp/tournament-storage.mjs'

const now = '2026-10-10T12:00:00.000Z'
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, img: '/roster/_placeholder.png', strength: i % 33, statsSnapshot: null }))
const make = (count, format = 'double', seed = 42, bestOf = 1, roles = 'random') => createTournament({
  id: `event-${count}-${format}`, name: 'Test Championship', seed, createdAt: now,
  rules: { format, formation: 'random', roles, roundsBestOf: bestOf, finalBestOf: bestOf },
  teams: Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: `Team ${i}`, color: '#4ea6ff', players: players(count * 5).slice(i * 5, i * 5 + 5) })),
})
const finishGame = (t, id, side = 0) => {
  const ready = tournamentState(t).series.find((s) => s.series.id === id)
  const started = startGame(t, id, now)
  const s = started.series.find((s) => s.id === id)
  const g = s.games[s.games.length - 1]
  assert.equal(new Set(g.result.matchups.flatMap((m) => [m.blue.id, m.red.id])).size, 10)
  assert.equal(new Set(g.result.matchups.map((m) => m.lane)).size, 5)
  const blue = new Set(t.teams.find((team) => team.id === g.blueTeamId).players.map((p) => p.id))
  const red = new Set(t.teams.find((team) => team.id === g.redTeamId).players.map((p) => p.id))
  for (const m of g.result.matchups) { assert(blue.has(m.blue.id)); assert(red.has(m.red.id)); assert(!m.curse) }
  return recordWinner(started, id, g.id, ready.teams[side])
}

let simulations = 0
for (const count of [2, 3, 4, 5, 6, 8, 17, 33]) {
  for (const format of ['single', 'double']) {
    for (let seed = 0; seed < 12; seed++) {
      let t = startTournament(make(count, format, seed), now)
      let played = 0
      while (!tournamentState(t).championId) {
        const state = tournamentState(t)
        const available = state.series.filter((s) => s.status === 'ready' || s.status === 'playing')
        assert(available.length > 0, `Deadlocked bracket: ${count}, ${format}, ${seed}`)
        const s = available[(played + seed) % available.length]
        // Exercise both reset outcomes and varied upper/lower results.
        const side = s.series.id === 'GF' ? seed % 2 : (seed + played) % 2
        t = finishGame(t, s.series.id, side)
        played++
        assert(played <= count * 2, 'Bracket never terminates')
        for (const [team, losses] of Object.entries(tournamentState(t).losses)) {
          assert(losses <= (format === 'single' ? 1 : 2), `${team} re-entered after elimination`)
        }
      }
      const state = tournamentState(t)
      assert.equal(played, format === 'single' ? count - 1 : count * 2 - 2 + seed % 2)
      for (const [team, losses] of Object.entries(state.losses)) {
        assert.equal(losses, team === state.championId ? (format === 'double' ? seed % 2 : 0) : format === 'single' ? 1 : 2)
      }
      const restored = parseLibrary(JSON.stringify({ version: 1, events: [t] })).events[0]
      assert.deepEqual(restored, t)
      assert.deepEqual(tournamentState(restored), state)
      simulations++
    }
  }
}

// Team formation, missing strengths, deterministic draws, and rank snake distribution.
const pool = players(20)
const balanced = formTeams(pool, 4, 'balanced', 12)
assert.deepEqual(balanced.map((team) => team.map((p) => p.strength)), [[19, 12, 11, 4, 3], [18, 13, 10, 5, 2], [17, 14, 9, 6, 1], [16, 15, 8, 7, 0]])
assert.deepEqual(formTeams(pool, 4, 'random', 33), formTeams(pool, 4, 'random', 33))
assert.throws(() => formTeams(pool.map((p) => ({ ...p, strength: undefined })), 4, 'balanced', 1), /estimate/)
assert.throws(() => formTeams([...pool.slice(0, 19), pool[0]], 4, 'random', 1), /unique/)
assert.throws(() => make(1), /two teams/)
const duplicates = make(2)
duplicates.teams[1].players[0] = duplicates.teams[0].players[0]
assert.throws(() => startTournament(duplicates, now), /more than once/)

// BO3/BO5, game side alternation, corrections and chosen-role validation.
for (const bestOf of [3, 5]) {
  let t = startTournament(make(2, 'single', 1, bestOf, 'chosen'), now)
  const id = t.series[0].id
  const teams = tournamentState(t).series[0].teams
  assert.throws(() => startGame(t, id, now, { blue: ['bad'], red: ['bad'] }), /exactly one role/)
  const roleOrder = {
    blue: t.teams.find((team) => team.id === teams[0]).players.map((p) => p.id).reverse(),
    red: t.teams.find((team) => team.id === teams[1]).players.map((p) => p.id).reverse(),
  }
  let started = startGame(t, id, now, roleOrder)
  assert.deepEqual(started.series[0].games[0].result.matchups.map((m) => m.blue.id), roleOrder.blue)
  assert.throws(() => startGame(started, id, now), /Finish/)
  assert.deepEqual(parseLibrary(JSON.stringify({ version: 1, events: [started] })).events[0], started)
  started = recordWinner(started, id, started.series[0].games[0].id, teams[0])
  t = recordWinner(started, id, started.series[0].games[0].id, teams[1])
  assert.equal(tournamentState(t).series[0].score[1], 1)
  const second = startGame(t, id, now)
  assert.equal(second.series[0].games[1].blueTeamId, teams[1])
  assert.throws(() => recordWinner(second, id, second.series[0].games[0].id, teams[0]), /Undo later/)
  t = undoGame(second, id)
  for (let n = 0; n < Math.floor(bestOf / 2) + 1; n++) t = finishGame(t, id, 0)
  assert.equal(tournamentState(t).championId, teams[0])
  assert.throws(() => startGame(t, id, now), /not ready/)
}

// Prediction locks persist after undo; points recompute rather than accumulate.
let t = make(4, 'single', 5)
const opening = tournamentState(t).series.find((s) => s.status === 'ready')
const pick = { id: 'viewer', name: 'Viewer', championId: opening.teams[0], series: { [opening.series.id]: opening.teams[0] } }
t = savePrediction(t, pick)
t = savePrediction(t, { ...pick, id: 'viewer2', name: 'Another viewer' })
t = startTournament(t, now)
assert.throws(() => savePrediction(t, { ...pick, championId: opening.teams[1] }), /Champion picks locked/)
t = finishGame(t, opening.series.id, 0)
assert.equal(predictionStandings(t)[0].points, 1)
assert.deepEqual(predictionStandings(t).map((p) => p.position), [1, 1])
assert.throws(() => savePrediction(t, { ...pick, series: {} }), /picks are locked/)
const rolledBack = undoGame(t, opening.series.id)
assert.equal(predictionStandings(rolledBack)[0].points, 0)
assert.throws(() => savePrediction(rolledBack, { ...pick, series: {} }), /picks are locked/)
const other = tournamentState(t).series.find((s) => s.status === 'ready')
t = finishGame(t, other.series.id)
const final = tournamentState(t).series.find((s) => s.status === 'ready')
t = startGame(t, final.series.id, now)
assert(descendants(t, opening.series.id).has(final.series.id))
assert.throws(() => undoGame(t, opening.series.id), /dependent games/)
t = undoGame(t, final.series.id)
assert.doesNotThrow(() => undoGame(t, opening.series.id))

// Recovery never clobbers unreadable saves or another tab's newer write.
const data = new Map()
const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
const library = { version: 1, events: [make(4)] }
assert.equal(readLibrary(storage).error, null)
const saved = writeLibrary(storage, library, null)
assert.throws(() => writeLibrary(storage, library, null), /another tab/)
assert.equal(storage.getItem(TOURNAMENT_STORAGE_KEY), saved)
data.set(TOURNAMENT_STORAGE_KEY, '{broken')
assert(readLibrary(storage).error)
assert.throws(() => writeLibrary(storage, library, '{broken'), /unreadable/)
assert.equal(data.get(TOURNAMENT_STORAGE_KEY), '{broken')
recoverLibrary(storage, library, '{broken')
assert([...data.entries()].some(([key, value]) => key.includes('.recovery.') && value === '{broken'))
assert.equal(readLibrary(storage).error, null)
assert.throws(() => parseLibrary('{"version":9,"events":[]}'), /version 1/)
assert.deepEqual(parseLibrary('\uFEFF' + saved), library)
assert.match(readLibrary({ getItem: () => { throw Error('Denied') } }).error, /Denied/)
assert.throws(() => writeLibrary({ getItem: () => null, setItem: () => { throw Error('Quota exceeded') } }, library, null), /Quota/)
const corrupted = JSON.parse(saved)
corrupted.events[0].series[0].sources[0] = { kind: 'winner', seriesId: 'not-a-match' }
assert.throws(() => parseLibrary(JSON.stringify(corrupted)), /feed/)
// JSON object property order is irrelevant, including in recorded assignments.
const reversedKeys = (value) => Array.isArray(value) ? value.map(reversedKeys) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reversedKeys(child)])) : value
assert.deepEqual(parseLibrary(JSON.stringify(reversedKeys({ version: 1, events: [t] }))).events[0], t)
const tampered = JSON.parse(JSON.stringify({ version: 1, events: [t] }))
tampered.events[0].series[0].games[0].result.matchups[0].blue.name = 'Wrong player snapshot'
assert.throws(() => parseLibrary(JSON.stringify(tampered)), /assignment/)
console.log(`Tournament verification passed: ${simulations} full brackets, all target sizes, reset paths, team formation, series, corrections, predictions, and save recovery.`)
