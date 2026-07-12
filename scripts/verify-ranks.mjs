/**
 * Checks that rankScore() orders the entire ranked ladder correctly — a bug here would
 * silently invert the betting odds, which nobody would notice until someone got called
 * a favourite over a player two tiers above them.
 *
 *   npm run verify-ranks
 */
import { rankScore, formatRank, shortRank } from '../tmp/stats.mjs'

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND']
const DIVS = ['IV', 'III', 'II', 'I']

// Build the whole ladder, bottom to top, in the order it SHOULD sort.
const ladder = []
for (const tier of TIERS) {
  for (const division of DIVS) {
    for (const lp of [0, 50, 99]) ladder.push({ tier, division, lp, wins: 0, losses: 0 })
  }
}
for (const lp of [0, 200, 500]) ladder.push({ tier: 'MASTER', division: '', lp, wins: 0, losses: 0 })
for (const lp of [0, 300, 800]) ladder.push({ tier: 'GRANDMASTER', division: '', lp, wins: 0, losses: 0 })
for (const lp of [0, 500, 1500]) ladder.push({ tier: 'CHALLENGER', division: '', lp, wins: 0, losses: 0 })

const failures = []

// 1. Strictly ascending all the way up.
for (let i = 1; i < ladder.length; i++) {
  const prev = ladder[i - 1]
  const cur = ladder[i]
  if (rankScore(cur) <= rankScore(prev)) {
    failures.push(
      `not ascending: ${formatRank(prev)} (${rankScore(prev).toFixed(2)}) >= ${formatRank(cur)} (${rankScore(cur).toFixed(2)})`,
    )
  }
}

// 2. Tier boundaries: the top of one tier must sit below the bottom of the next.
for (let t = 1; t < TIERS.length; t++) {
  const topOfLower = { tier: TIERS[t - 1], division: 'I', lp: 99, wins: 0, losses: 0 }
  const bottomOfHigher = { tier: TIERS[t], division: 'IV', lp: 0, wins: 0, losses: 0 }
  if (rankScore(bottomOfHigher) <= rankScore(topOfLower)) {
    failures.push(`tier boundary broken: ${TIERS[t - 1]} I 99LP outranks ${TIERS[t]} IV 0LP`)
  }
}

// 3. Diamond I 99LP must be below Master 0LP.
const dia = { tier: 'DIAMOND', division: 'I', lp: 99, wins: 0, losses: 0 }
const master = { tier: 'MASTER', division: '', lp: 0, wins: 0, losses: 0 }
if (rankScore(master) <= rankScore(dia)) failures.push('DIAMOND I outranks MASTER')

// 4. Sanity: a garbage tier must not blow up.
if (rankScore({ tier: 'WOOD', division: 'V', lp: 0, wins: 0, losses: 0 }) !== 0) {
  failures.push('unknown tier should score 0, not throw or return NaN')
}

// 5. shortRank must be unique per tier+division (it's what the scoreboard prints).
const shorts = new Map()
for (const r of ladder) {
  const s = shortRank(r)
  const key = `${r.tier}|${r.division}`
  const seen = shorts.get(s)
  if (seen && seen !== key) failures.push(`shortRank collision: ${seen} and ${key} both render "${s}"`)
  shorts.set(s, key)
}

console.log(`\nladder rungs checked: ${ladder.length}\n`)
console.log('  sample:')
for (const r of [ladder[0], ladder[30], ladder[60], ladder[ladder.length - 4], ladder[ladder.length - 1]]) {
  console.log(`    ${formatRank(r).padEnd(26)} ${shortRank(r).padEnd(5)} score ${rankScore(r).toFixed(2)}`)
}

console.log('')
if (failures.length) {
  console.error(`❌ ${failures.length} FAILURES`)
  for (const f of failures.slice(0, 15)) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ rank ladder is strictly ordered from IRON IV to CHALLENGER')
console.log('   · tier boundaries hold · apex tiers sit above Diamond · no shortRank collisions\n')
