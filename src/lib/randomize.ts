import { HYPE_TAGS } from '../roster'
import { LANES, type Curse, type CurseType, type Matchup, type MatchResult, type Odds, type Player, type Stat } from '../types'
import { hashString, mulberry32, pick, randInt, shuffle } from './rng'
import { oddsFromRank } from './stats'

export const TEAM_SIZE = 5
export const REQUIRED_PLAYERS = TEAM_SIZE * 2

/** Chance that a curse fires at all, per roll. */
const CURSE_CHANCE = 0.25

/**
 * Draw a full fight card from exactly 10 players.
 *
 * The returned `matchups` are the FINAL truth — curses have already been applied to
 * them. Each cursed matchup carries the pre-curse pairing in `curse.before` so the
 * reveal can show the original, play the curse, and land on the real result. The
 * animation therefore never contradicts the scoreboard.
 */
export function randomize(players: Player[], seed = (Math.random() * 2 ** 32) >>> 0): MatchResult {
  if (players.length !== REQUIRED_PLAYERS) {
    throw new Error(`randomize() needs exactly ${REQUIRED_PLAYERS} players, got ${players.length}`)
  }

  const rand = mulberry32(seed)

  // 1. Shuffle, split down the middle into two teams.
  const pool = shuffle(players, rand)
  const blue = pool.slice(0, TEAM_SIZE)
  const red = pool.slice(TEAM_SIZE)

  // 2. Random lane order, pair blue[i] against red[i].
  const lanes = shuffle(LANES, rand)
  const matchups: Matchup[] = lanes.map((lane, i) => ({ lane, blue: blue[i], red: red[i] }))

  // 3. Maybe curse one of them — mutating the real assignment.
  applyCurse(matchups, rand)

  return { seed, matchups }
}

function applyCurse(matchups: Matchup[], rand: () => number) {
  if (rand() > CURSE_CHANCE) return

  const type: CurseType = pick(['SWAP', 'EARTHQUAKE', 'CURSED_LANE'] as const, rand)

  if (type === 'SWAP') {
    // Two players trade teams. The reveal shows them on their original sides first.
    const i = randInt(0, matchups.length - 1, rand)
    const m = matchups[i]
    const before = { blue: m.blue, red: m.red }
    matchups[i] = { ...m, blue: before.red, red: before.blue, curse: { type, before } }
    return
  }

  if (type === 'EARTHQUAKE') {
    // A lane shatters and re-draws its fighters from a LATER lane (one not yet revealed,
    // so its own reveal simply shows the already-final pairing — no contradiction).
    const i = randInt(0, matchups.length - 2, rand)
    const j = randInt(i + 1, matchups.length - 1, rand)
    const a = matchups[i]
    const b = matchups[j]
    const before = { blue: a.blue, red: a.red }

    matchups[i] = { ...a, blue: b.blue, red: b.red, curse: { type, before } }
    matchups[j] = { ...b, blue: before.blue, red: before.red }
    return
  }

  // CURSED_LANE — purely cosmetic. Changes nothing, just adds a stake.
  const i = randInt(0, matchups.length - 1, rand)
  matchups[i] = { ...matchups[i], curse: { type } as Curse }
}

/* ────────────────────────────────────────────────────────────
   Fake stats & odds — pure fiction, but deterministic.
   Seeded on (playerId + matchSeed) so they hold still during a
   match and change on every reroll.
   ──────────────────────────────────────────────────────────── */

const STAT_LABELS = ['TILT RESISTANCE', 'TOXICITY', 'GANKING IQ', 'MENTAL BOOM'] as const

export function statsFor(player: Player, seed: number): Stat[] {
  const rand = mulberry32(hashString(player.id) ^ seed)
  return STAT_LABELS.map((label) => ({ label, value: randInt(12, 99, rand) }))
}

export function hypeTagFor(player: Player, seed: number): string {
  const rand = mulberry32(hashString(player.id + ':tag') ^ seed)
  return pick(HYPE_TAGS, rand)
}

export function nicknameFor(player: Player, seed: number): string {
  return player.nickname ?? hypeTagFor(player, seed)
}

/**
 * Moneyline for a bout.
 *
 * If both fighters have synced ranked data, the line comes from the REAL rank gap —
 * so it's defensible, and a Diamond vs a Silver reads as the massacre it is. Otherwise
 * (unranked, unsynced, or a dead heat) it falls back to seeded fiction, so the odds
 * board is never empty.
 */
export function oddsFor(m: Matchup, seed: number): Odds {
  const real = oddsFromRank(m.blue, m.red)
  if (real) return { ...real, real: true }

  const rand = mulberry32(hashString(m.lane + m.blue.id + m.red.id) ^ seed)
  const blueFavored = rand() < 0.5
  const fav = -randInt(110, 320, rand)
  const dog = +randInt(105, 290, rand)
  return blueFavored
    ? { blue: String(fav), red: `+${dog}`, favorite: 'BLUE', real: false }
    : { blue: `+${dog}`, red: String(fav), favorite: 'RED', real: false }
}
