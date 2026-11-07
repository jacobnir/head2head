/**
 * Hammers the points-league engine: every match is a clean 5v5, the lane rule for each
 * match is honoured, stakes come from the wheel or the rank odds as configured, the
 * leaderboard adds up, prize money is conserved through ties, and undo is exact.
 *
 * Run:  npm run verify-league
 */
import { readFileSync } from 'node:fs'
import {
  assignLanes, createLeague, drawTeams, isComplete, phaseOf, pot, recordWinner, spinWheel,
  stakeFromChance, standings, startMatch, undo, wheelIndex, DEFAULT_SCHEDULE, DEFAULT_WHEEL,
} from '../tmp/league.mjs'

const LANES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']
const failures = []
const fail = (msg) => failures.push(msg)
const throws = (fn, label) => { try { fn(); fail(`expected to throw: ${label}`) } catch { /* expected */ } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Real ids so RANK mode reads real ranks; padded with fakes if the stats file is thin.
const stats = JSON.parse(readFileSync(new URL('../src/data/playerStats.json', import.meta.url), 'utf8').replace(/^﻿/, ''))
const ids = Object.keys(stats.players ?? {})
const pool = [...ids, ...Array.from({ length: 12 }, (_, i) => `fake${i}`)].map((id) => ({ id, name: id.toUpperCase(), img: `/roster/${id}.png` }))

const RULES = { schedule: DEFAULT_SCHEDULE, wheel: DEFAULT_WHEEL, entryFee: 150, currency: 'SEK', payouts: [1200, 300] }
const make = (rules, seed, players) => createLeague({ id: `L${seed}`, name: 'Test', createdAt: '2026-11-07T18:00:00Z', seed, players, rules })

// ── 1. Setup validation ───────────────────────────────────────
throws(() => make(RULES, 1, pool.slice(0, 9)), 'nine players')
throws(() => make(RULES, 1, [...pool.slice(0, 9), pool[0]]), 'duplicate player')
throws(() => make({ ...RULES, payouts: [1500, 1] }, 1, pool.slice(0, 10)), 'prizes above pot')
throws(() => make({ ...RULES, wheel: [3] }, 1, pool.slice(0, 10)), 'one-segment wheel')
throws(() => make({ ...RULES, wheel: [0, 2] }, 1, pool.slice(0, 10)), 'zero on the wheel')
throws(() => startMatch(make(RULES, 1, pool.slice(0, 10)), 'x', undefined), 'match without a points mode')

// ── 2. Stake formula ──────────────────────────────────────────
for (let pct = 0; pct <= 100; pct++) {
  const s = stakeFromChance(pct)
  if (s.BLUE + s.RED !== 10) fail(`stake at ${pct}% does not add to 10: ${JSON.stringify(s)}`)
  if (pct > 50 && s.BLUE > s.RED) fail(`favourite paid more than underdog at ${pct}%`)
  if (pct < 50 && s.RED > s.BLUE) fail(`favourite paid more than underdog at ${pct}%`)
  if (Math.min(s.BLUE, s.RED) < 1) fail(`stake below 1 at ${pct}%`)
}
if (!same(stakeFromChance(50), { BLUE: 5, RED: 5 })) fail('an even match should pay 5 each')

// ── 3. Full simulated nights ──────────────────────────────────
const RUNS = 3000
const wheelHits = DEFAULT_WHEEL.map(() => 0)
for (let run = 0; run < RUNS; run++) {
  const offset = run % Math.max(1, pool.length - 10)
  let league = make(RULES, run * 7919 + 13, pool.slice(offset, offset + 10))
  const playerIds = league.players.map((p) => p.id)
  let expectedPoints = 0

  for (let i = 0; i < DEFAULT_SCHEDULE.length; i++) {
    // The host picks per match, so every night mixes both modes.
    const mode = (run + i) % 2 ? 'RANK' : 'WHEEL'
    throws(() => recordWinner(league, 'BLUE'), `run ${run}: winner before match`)
    league = startMatch(league, '2026-11-07T19:00:00Z', mode)
    throws(() => startMatch(league, 'x', mode), `run ${run}: two open matches`)
    let m = league.matches[i]
    if (m.lanes !== DEFAULT_SCHEDULE[i]) fail(`run ${run} match ${i}: lane rule ${m.lanes}`)
    if (m.points !== mode) fail(`run ${run} match ${i}: points mode ${m.points}`)

    if (mode === 'WHEEL') {
      if (phaseOf(m) !== 'SPIN') fail(`run ${run} match ${i}: expected SPIN`)
      throws(() => drawTeams(league), `run ${run}: draw before spin`)
      league = spinWheel(league)
      throws(() => spinWheel(league), `run ${run}: spin twice`)
      m = league.matches[i]
      wheelHits[m.wheel.index]++
      if (m.wheel.value !== DEFAULT_WHEEL[m.wheel.index]) fail(`run ${run}: wheel value mismatch`)
    } else throws(() => spinWheel(league), `run ${run}: spin in RANK mode`)

    const beforeDraw = league
    league = drawTeams(league)
    m = league.matches[i]
    if (!same(drawTeams(beforeDraw), league)) fail(`run ${run} match ${i}: draw not deterministic`)

    // Clean 5v5, everyone exactly once.
    const all = [...m.blue, ...m.red]
    if (m.blue.length !== 5 || m.red.length !== 5) fail(`run ${run} match ${i}: not 5v5`)
    if (new Set(all).size !== 10 || !playerIds.every((id) => all.includes(id))) fail(`run ${run} match ${i}: player missing or doubled`)

    if (mode === 'WHEEL' && !(m.stake.BLUE === m.wheel.value && m.stake.RED === m.wheel.value)) fail(`run ${run}: wheel stake mismatch`)
    if (mode === 'RANK' && m.stake.BLUE + m.stake.RED !== 10) fail(`run ${run}: rank stakes do not add to 10`)

    if (m.lanes === 'CHOSEN') {
      if (m.result) fail(`run ${run} match ${i}: chosen match got lanes before the teams picked`)
      throws(() => recordWinner(league, 'RED'), `run ${run}: winner before lanes`)
      throws(() => assignLanes(league, m.red, m.blue), `run ${run}: lanes with swapped teams`)
      throws(() => assignLanes(league, [m.blue[0], ...m.blue.slice(0, 4)], m.red), `run ${run}: duplicate lane`)
      const blueOrder = [...m.blue].reverse()
      const redOrder = [...m.red.slice(2), ...m.red.slice(0, 2)]
      league = assignLanes(league, m.blue, m.red)
      league = assignLanes(league, blueOrder, redOrder) // re-assigning before a result is fine
      m = league.matches[i]
      m.result.matchups.forEach((x, k) => {
        if (x.lane !== LANES[k] || x.blue.id !== blueOrder[k] || x.red.id !== redOrder[k]) fail(`run ${run} match ${i}: lane ${k} not as chosen`)
      })
    } else {
      throws(() => assignLanes(league, m.blue, m.red), `run ${run}: manual lanes on a full random roll`)
      // Sides must be the FINAL card, after any curse.
      if (!same(m.result.matchups.map((x) => x.blue.id), m.blue) || !same(m.result.matchups.map((x) => x.red.id), m.red)) fail(`run ${run} match ${i}: sides differ from the card`)
    }

    // Undo an open match, then replay it: the same draw must come back.
    const drawn = league
    league = undo(league)
    if (league.matches.length !== i) fail(`run ${run}: undo did not abandon match`)
    league = startMatch(league, m.startedAt, mode)
    if (mode === 'WHEEL') league = spinWheel(league)
    league = drawTeams(league)
    if (m.lanes === 'CHOSEN') league = assignLanes(league, m.blue, m.red)
    if (!same(league, drawn)) fail(`run ${run} match ${i}: replay after undo differs`)

    const winner = (run + i) % 3 ? 'BLUE' : 'RED'
    const decided = recordWinner(league, winner)
    if (!same(undo(decided), league)) fail(`run ${run} match ${i}: undoing a result is not exact`)
    league = decided
    throws(() => assignLanes(league, m.blue, m.red), `run ${run}: lanes after result`)
    expectedPoints += 5 * league.matches[i].stake[winner]
  }

  throws(() => startMatch(league, 'x', 'WHEEL'), `run ${run}: sixth match`)
  if (!isComplete(league)) fail(`run ${run}: not complete after five results`)

  const table = standings(league)
  const points = table.reduce((a, r) => a + r.points, 0)
  if (points !== expectedPoints) fail(`run ${run}: leaderboard has ${points} points, expected ${expectedPoints}`)
  if (table.some((r) => r.played !== 5)) fail(`run ${run}: someone did not play five`)
  const paid = table.reduce((a, r) => a + r.payout, 0)
  if (Math.abs(paid - 1500) > 0.05) fail(`run ${run}: paid out ${paid}, expected 1500`)
  if (pot(league) !== 1500) fail(`run ${run}: pot ${pot(league)}`)
  for (let k = 1; k < table.length; k++) {
    if (table[k].points > table[k - 1].points) fail(`run ${run}: leaderboard out of order`)
    if (table[k].points === table[k - 1].points && table[k].place !== table[k - 1].place) fail(`run ${run}: tie with different places`)
  }
}

// ── 4. Tie splits, hand-built ─────────────────────────────────
function scripted(points) {
  // Ten players; give player k exactly points[k] via fabricated decided matches.
  const league = make(RULES, 99, pool.slice(0, 10))
  const matches = points.flatMap((p, k) => p ? [{ index: 0, lanes: 'RANDOM', points: 'WHEEL', seed: 0, startedAt: '', blue: [league.players[k].id], red: [], stake: { BLUE: p, RED: 0 }, winner: 'BLUE' }] : [])
  return standings({ ...league, matches })
}
const payoutsOf = (table) => table.map((r) => r.payout)
const cases = [
  [[9, 5, 3, 0, 0, 0, 0, 0, 0, 0], [1200, 300, 0, 0, 0, 0, 0, 0, 0, 0], 'clear 1st and 2nd'],
  [[9, 9, 3, 0, 0, 0, 0, 0, 0, 0], [750, 750, 0, 0, 0, 0, 0, 0, 0, 0], 'two tied for 1st'],
  [[9, 9, 9, 0, 0, 0, 0, 0, 0, 0], [500, 500, 500, 0, 0, 0, 0, 0, 0, 0], 'three tied for 1st'],
  [[9, 5, 5, 0, 0, 0, 0, 0, 0, 0], [1200, 150, 150, 0, 0, 0, 0, 0, 0, 0], 'two tied for 2nd'],
  [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], Array(10).fill(150), 'nobody scored'],
]
for (const [pts, expected, label] of cases) {
  const got = payoutsOf(scripted(pts))
  if (!same(got, expected)) fail(`tie split "${label}": got ${got.join('/')}, expected ${expected.join('/')}`)
}

// ── 5. Wheel fairness ─────────────────────────────────────────
const SPINS = 50000
const counts = DEFAULT_WHEEL.map(() => 0)
for (let s = 0; s < SPINS; s++) counts[wheelIndex(s * 2654435761 >>> 0, DEFAULT_WHEEL.length)]++
const expectedShare = SPINS / DEFAULT_WHEEL.length
counts.forEach((c, i) => { if (Math.abs(c - expectedShare) / expectedShare > 0.05) fail(`wheel segment ${i} hit ${c} of ${SPINS} — not uniform`) })

if (failures.length) {
  console.error(`\n❌ ${failures.length} league failure(s):`)
  for (const f of failures.slice(0, 30)) console.error(`   · ${f}`)
  process.exit(1)
}
console.log(`✅ league: ${RUNS} simulated nights, 5 tie-split cases, ${SPINS} wheel spins — all consistent`)
console.log(`   wheel hits in simulated nights: ${wheelHits.join(' / ')}`)
