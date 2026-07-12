/**
 * Prints the real rank-derived odds for a few matchups, using the actual synced data.
 * A quick eyeball on whether the headline feature reads sensibly.
 *
 *   npm run preview-odds
 */
import {
  oddsFromRank,
  statsFor,
  formatRank,
  mismatchTag,
  laneWinChance,
  teamWinChance,
} from '../tmp/stats.mjs'

const ids = ['benne', 'david', 'frode', 'isak', 'jacob', 'jeppe', 'noah', 'pippo', 'thure', 'wille']
const P = (id) => ({ id, name: id.toUpperCase(), img: '' })

console.log('\nRANKS\n')
for (const id of ids) {
  const s = statsFor(P(id))
  console.log(`  ${id.padEnd(8)} ${s?.rank ? formatRank(s.rank) : 'UNRANKED'}`)
}

console.log('\nSAMPLE BOUTS\n')
let real = 0
let fiction = 0

for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const blue = P(ids[i])
    const red = P(ids[j])
    const o = oddsFromRank(blue, red)
    if (!o) {
      fiction++
      continue
    }
    real++
    const tag = mismatchTag(o.gap)
    console.log(
      `  ${ids[i].toUpperCase().padEnd(8)} ${o.blue.padStart(6)}  /  ${o.red.padEnd(6)} ${ids[j].toUpperCase().padEnd(8)}` +
        `  fav: ${o.favorite.padEnd(5)} gap ${o.gap.toFixed(1).padStart(5)}${tag ? '  ← ' + tag : ''}`,
    )
  }
}

console.log(`\n  ${real} bouts priced off real rank, ${fiction} fell back to fiction`)
console.log('  (fiction = one side unranked — expected for ISAK, NOAH, THURE)')

/* ── Win-chance sanity check ────────────────────────────────── */

console.log('\nWIN CHANCE — does the curve read sensibly?\n')
const CASES = [
  ['benne', 'david', 'one division apart'],
  ['jacob', 'jeppe', 'Gold I vs Plat II'],
  ['pippo', 'wille', 'Plat III vs Silver III'],
  ['benne', 'wille', 'Emerald II vs Silver III'],
  ['isak', 'jacob', 'unranked — must refuse'],
]
for (const [a, b, why] of CASES) {
  const c = laneWinChance(P(a), P(b))
  const line = c ? `${String(c.bluePct).padStart(3)}% / ${String(c.redPct).padEnd(3)}%` : ' NO LINE   '
  console.log(`  ${a.toUpperCase().padEnd(7)} vs ${b.toUpperCase().padEnd(7)}  ${line}  ${why}`)
}

// A plausible full fight card, to exercise the team projection.
const CARD = [
  { lane: 'TOP', blue: P('benne'), red: P('wille') },
  { lane: 'JUNGLE', blue: P('david'), red: P('jacob') },
  { lane: 'MID', blue: P('frode'), red: P('jeppe') },
  { lane: 'ADC', blue: P('pippo'), red: P('isak') },
  { lane: 'SUPPORT', blue: P('noah'), red: P('thure') },
]

console.log('\nTEAM PROJECTION on a sample card\n')
for (const m of CARD) {
  const c = laneWinChance(m.blue, m.red)
  const split = c ? `${String(c.bluePct).padStart(3)}% / ${String(c.redPct).padEnd(3)}%` : ' NO LINE   '
  console.log(`  ${m.lane.padEnd(8)} ${m.blue.name.padEnd(7)} ${split} ${m.red.name}`)
}

const t = teamWinChance(CARD)
console.log(
  `\n  BLUE  avg ${t.blue.label.padEnd(13)} (${t.blue.ranked}/${t.blue.size} ranked)  score ${t.blue.avg.toFixed(2)}`,
)
console.log(
  `  RED   avg ${t.red.label.padEnd(13)} (${t.red.ranked}/${t.red.size} ranked)  score ${t.red.avg.toFixed(2)}`,
)
console.log(`\n  → BLUE ${t.bluePct}%  /  RED ${t.redPct}%\n`)

// Every player must move the team number, whoever they're drawn against — that's the
// point of averaging team rank rather than the head-to-head lanes.
const swapped = CARD.map((m) => (m.lane === 'ADC' ? { ...m, blue: P('thure') } : m))
const t2 = teamWinChance(swapped)
console.log('  sanity: does swapping a strong player out actually move the projection?')
console.log(`    BLUE with PIPPO  : avg ${t.blue.avg.toFixed(2)} → ${t.bluePct}%`)
console.log(`    BLUE with THURE  : avg ${t2.blue.avg.toFixed(2)} → ${t2.bluePct}%`)
console.log(
  `    ${t.bluePct !== t2.bluePct ? '✅ every ranked player moves the number' : '❌ a player is being ignored'}\n`,
)

// Nobody should be NO LINE now that flex is a fallback.
const unpriced = CARD.filter((m) => !laneWinChance(m.blue, m.red)).length
console.log(`  ${unpriced === 0 ? '✅' : '⚠️ '} lanes with no line: ${unpriced}\n`)
