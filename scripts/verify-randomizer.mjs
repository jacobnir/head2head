/**
 * Hammers the real randomize() to prove the fight card is always coherent:
 * every selected player appears exactly once, and — critically — the pre-curse
 * pairing the reveal shows always reconciles with the final card it lands on.
 *
 * Run:  node scripts/verify-randomizer.mjs
 * (bundle first: npx esbuild src/lib/randomize.ts --bundle --format=esm --outfile=tmp/randomize.mjs)
 */
import { randomize } from '../tmp/randomize.mjs'

const LANES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']
const players = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  name: `P${i}`,
  img: `/roster/p${i}.png`,
}))

const RUNS = 20000
const curseCounts = { SWAP: 0, EARTHQUAKE: 0, CURSED_LANE: 0, none: 0 }
const teamCounts = Object.fromEntries(players.map((p) => [p.id, { BLUE: 0, RED: 0 }]))
const laneCounts = Object.fromEntries(players.map((p) => [p.id, Object.fromEntries(LANES.map((l) => [l, 0]))]))
const failures = []

const fail = (run, msg) => failures.push(`run ${run}: ${msg}`)

for (let run = 0; run < RUNS; run++) {
  const { matchups, seed } = randomize(players)

  // 1. Exactly 5 bouts, all lanes distinct, all five lanes present.
  if (matchups.length !== 5) fail(run, `expected 5 matchups, got ${matchups.length}`)
  const lanes = matchups.map((m) => m.lane)
  if (new Set(lanes).size !== 5) fail(run, `duplicate lanes: ${lanes.join(',')}`)
  for (const l of lanes) if (!LANES.includes(l)) fail(run, `unknown lane ${l}`)

  // 2. All 10 players used exactly once.
  const used = matchups.flatMap((m) => [m.blue.id, m.red.id])
  if (used.length !== 10) fail(run, `expected 10 slots, got ${used.length}`)
  if (new Set(used).size !== 10) fail(run, `player appears twice: ${used.sort().join(',')}`)
  for (const p of players) if (!used.includes(p.id)) fail(run, `player ${p.id} missing from card`)

  // 3. Nobody fights themselves.
  for (const m of matchups) if (m.blue.id === m.red.id) fail(run, `${m.lane}: self-matchup`)

  // 4. Teams are 5v5.
  const blueIds = matchups.map((m) => m.blue.id)
  const redIds = matchups.map((m) => m.red.id)
  if (blueIds.length !== 5 || redIds.length !== 5) fail(run, 'teams are not 5v5')
  if (blueIds.some((id) => redIds.includes(id))) fail(run, 'player on both teams')

  // 5. THE BIG ONE — the curse must reconcile. The reveal shows curse.before,
  //    plays the curse, and lands on the matchup's real blue/red. If those two
  //    can't be reconciled, the animation lied to the room.
  const cursed = matchups.filter((m) => m.curse)
  if (cursed.length > 1) fail(run, `${cursed.length} curses in one roll (expected <= 1)`)

  for (const m of cursed) {
    const { type, before } = m.curse
    curseCounts[type]++

    if (type === 'CURSED_LANE') {
      if (before) fail(run, 'CURSED_LANE is cosmetic but carries a `before` pairing')
      continue
    }

    if (!before) {
      fail(run, `${type} must carry a \`before\` pairing`)
      continue
    }

    if (type === 'SWAP') {
      // The two shown fighters must be the same two, on opposite sides.
      if (before.blue.id !== m.red.id || before.red.id !== m.blue.id) {
        fail(run, `SWAP did not actually swap: before ${before.blue.id}/${before.red.id} -> after ${m.blue.id}/${m.red.id}`)
      }
    }

    if (type === 'EARTHQUAKE') {
      // The players shown pre-quake must still be ON the card (they were moved to
      // another lane), and must not have silently vanished or been duplicated.
      if (!used.includes(before.blue.id)) fail(run, `EARTHQUAKE dropped ${before.blue.id} from the card`)
      if (!used.includes(before.red.id)) fail(run, `EARTHQUAKE dropped ${before.red.id} from the card`)
      // And the quake must have actually changed something.
      if (before.blue.id === m.blue.id && before.red.id === m.red.id) {
        fail(run, 'EARTHQUAKE re-drew the same pairing')
      }
      // The displaced pair must land on a LATER lane — one not yet revealed —
      // otherwise an already-shown bout would be contradicted.
      const quakeIdx = matchups.indexOf(m)
      const landedIdx = matchups.findIndex(
        (x) => x.blue.id === before.blue.id && x.red.id === before.red.id,
      )
      if (landedIdx <= quakeIdx) {
        fail(run, `EARTHQUAKE displaced pair landed on lane index ${landedIdx}, not after ${quakeIdx}`)
      }
    }
  }

  if (cursed.length === 0) curseCounts.none++

  // Distribution bookkeeping.
  matchups.forEach((m) => {
    teamCounts[m.blue.id].BLUE++
    teamCounts[m.red.id].RED++
    laneCounts[m.blue.id][m.lane]++
    laneCounts[m.red.id][m.lane]++
  })

  if (typeof seed !== 'number') fail(run, 'missing seed')
}

/* ── Report ─────────────────────────────────────────────────── */

console.log(`\nRUNS: ${RUNS}\n`)

console.log('CURSE RATE (target ~25% total, evenly split 3 ways):')
const cursedTotal = RUNS - curseCounts.none
console.log(`  any curse    ${((cursedTotal / RUNS) * 100).toFixed(1)}%`)
for (const t of ['SWAP', 'EARTHQUAKE', 'CURSED_LANE']) {
  console.log(`  ${t.padEnd(12)} ${((curseCounts[t] / RUNS) * 100).toFixed(1)}%`)
}

console.log('\nTEAM BALANCE (each player should be ~50/50 blue/red):')
let worstTeam = 0
for (const p of players) {
  const { BLUE, RED } = teamCounts[p.id]
  const pct = (BLUE / (BLUE + RED)) * 100
  worstTeam = Math.max(worstTeam, Math.abs(pct - 50))
  console.log(`  ${p.id.padEnd(4)} blue ${pct.toFixed(1)}%`)
}
console.log(`  worst deviation from 50%: ${worstTeam.toFixed(2)}pp`)

console.log('\nLANE SPREAD (each player should hit each lane ~20% of the time):')
let worstLane = 0
for (const p of players) {
  const counts = LANES.map((l) => laneCounts[p.id][l])
  const total = counts.reduce((a, b) => a + b, 0)
  const pcts = counts.map((c) => (c / total) * 100)
  worstLane = Math.max(worstLane, ...pcts.map((x) => Math.abs(x - 20)))
  console.log(`  ${p.id.padEnd(4)} ${pcts.map((x) => x.toFixed(1).padStart(5)).join('  ')}`)
}
console.log(`  worst deviation from 20%: ${worstLane.toFixed(2)}pp`)

console.log('')
if (failures.length) {
  console.error(`❌ ${failures.length} FAILURES`)
  for (const f of failures.slice(0, 20)) console.error('   ' + f)
  process.exit(1)
}

// Sanity-check the distributions too, not just the invariants.
if (worstTeam > 2) {
  console.error(`❌ team assignment looks biased (${worstTeam.toFixed(2)}pp off 50/50)`)
  process.exit(1)
}
if (worstLane > 2) {
  console.error(`❌ lane assignment looks biased (${worstLane.toFixed(2)}pp off 20%)`)
  process.exit(1)
}

console.log('✅ ALL INVARIANTS HOLD')
console.log('   · every player appears exactly once, every roll')
console.log('   · teams are always 5v5, lanes always unique')
console.log('   · every curse reconciles with the final card — the reveal never lies')
console.log('   · team + lane assignment are uniform\n')
