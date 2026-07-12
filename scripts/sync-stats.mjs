/**
 * Pulls live League data for everyone in the roster and writes src/data/playerStats.json.
 *
 *   npm run sync-stats
 *
 * Run this occasionally (not during a fight night). The app reads the resulting JSON —
 * it never calls Riot at runtime, so it needs no API key, has no latency mid-reveal,
 * and works offline while you're screen-sharing.
 *
 * Needs a key in .env:   RIOT_API_KEY=RGAPI-xxxx
 * Get one at https://developer.riotgames.com — a Development key is free and instant,
 * but expires every 24h, so you'll re-paste it whenever you re-sync.
 *
 * WHY op.gg ISN'T USED: they have no public API, their private one is CORS-blocked and
 * scraping it breaks their ToS. Riot's official API is the supported path.
 *
 * Flags:
 *   --dry-run       validate roster + Data Dragon without touching Riot (needs no key)
 *   --no-winrates   skip match-history crawling (much faster; drops champion win rates)
 *   --matches=N     how many recent matches to crawl per player (default 30)
 *   --force         ignore the local match cache
 */

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/playerStats.json')
const CACHE = join(ROOT, '.cache/matches')

const args = process.argv.slice(2)
const WITH_WINRATES = !args.includes('--no-winrates')
const FORCE = args.includes('--force')
const DRY_RUN = args.includes('--dry-run')
const MATCH_COUNT = Number(args.find((a) => a.startsWith('--matches='))?.split('=')[1] ?? 30)

/** Regional routing for account-v1 + match-v5. EUW/EUNE both live under `europe`. */
const REGIONAL = 'europe'
const DEFAULT_PLATFORM = 'euw1'

/**
 * When a riotId has no #TAG, try these. Riot handed everyone their region as the default
 * tag when Riot IDs launched, so these hit surprisingly often.
 *
 * DANGER: a name+tag is globally unique, so "Zliper#EUW" might be a total stranger who
 * happens to own that handle. Every guess is reported loudly with level + rank so you
 * can eyeball whether it's actually your friend. Never trust a guess silently.
 */
const TAG_GUESSES = {
  euw1: ['EUW', 'EUW1'],
  eun1: ['EUNE', 'EUN1'],
}

/* ── env ────────────────────────────────────────────────────── */

async function loadKey() {
  if (process.env.RIOT_API_KEY) return process.env.RIOT_API_KEY.trim()
  const envPath = join(ROOT, '.env')
  if (existsSync(envPath)) {
    const txt = await readFile(envPath, 'utf8')
    const m = txt.match(/^\s*RIOT_API_KEY\s*=\s*(.+)\s*$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

/* ── rate limiting ──────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * A development key allows 20 req/s and 100 req/2min. The 2-minute window is the one
 * that actually bites, so we track both and wait on whichever is saturated.
 */
class RateLimiter {
  constructor(limits) {
    this.limits = limits.map(([count, windowMs]) => ({ count, windowMs, hits: [] }))
  }

  async take() {
    for (;;) {
      const now = Date.now()
      let wait = 0
      for (const l of this.limits) {
        l.hits = l.hits.filter((t) => now - t < l.windowMs)
        if (l.hits.length >= l.count) {
          wait = Math.max(wait, l.windowMs - (now - l.hits[0]) + 60)
        }
      }
      if (wait === 0) {
        const t = Date.now()
        for (const l of this.limits) l.hits.push(t)
        return
      }
      process.stdout.write(`\r   ⏳ rate limit — waiting ${Math.ceil(wait / 1000)}s …          `)
      await sleep(Math.min(wait, 5000))
    }
  }
}

const limiter = new RateLimiter([
  [20, 1000],
  [100, 120_000],
])

let apiKey = null
let callCount = 0
/** Riot IDs that carried invisible characters and had to be scrubbed before use. */
const scrubbed = []

/** A bad key dooms every remaining player — abort the run rather than failing 18 times. */
class FatalApiError extends Error {}

async function riot(url, { allow404 = false } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await limiter.take()
    callCount++
    const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } })

    if (res.ok) return res.json()

    if (res.status === 404 && allow404) return null

    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? 10)
      process.stdout.write(`\r   ⏳ 429 — backing off ${retry}s …          `)
      await sleep((retry + 1) * 1000)
      continue
    }

    if (res.status === 401 || res.status === 403) {
      throw new FatalApiError(
        `Riot API rejected the key (${res.status}).\n\n` +
          `   Development keys EXPIRE EVERY 24 HOURS — that's almost certainly what happened.\n` +
          `   Grab a fresh one at https://developer.riotgames.com (it's on the dashboard,\n` +
          `   free and instant) and paste it into .env`,
      )
    }

    if (res.status >= 500) {
      await sleep(1000 * (attempt + 1))
      continue
    }

    throw new Error(`Riot API ${res.status} on ${url.replace(apiKey, '***')}`)
  }
  throw new Error(`Riot API kept failing: ${url.replace(apiKey, '***')}`)
}

/* ── Data Dragon (no key needed, public CDN) ────────────────── */

async function loadDDragon() {
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json()
  const version = versions[0]
  const data = await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)
  ).json()

  // championId (numeric) -> { key: 'MonkeyKing', name: 'Wukong' }
  const byId = new Map()
  for (const c of Object.values(data.data)) {
    byId.set(Number(c.key), { key: c.id, name: c.name })
  }
  return { version, byId }
}

/* ── roster (bundle the TS so roster.ts stays the single source) ── */

async function loadRoster() {
  const built = await esbuild.build({
    entryPoints: [join(ROOT, 'src/roster.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  const code = built.outputFiles[0].text
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  return mod.ROSTER
}

/* ── match-history crawl (for champion win rates) ───────────── */

async function cachedMatch(matchId) {
  const path = join(CACHE, `${matchId}.json`)
  if (!FORCE && existsSync(path)) {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      /* corrupt cache entry — refetch */
    }
  }
  const full = await riot(`https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/${matchId}`)

  // Store only what we need — full match JSON is ~500KB and we want a small, fast cache.
  const slim = {
    id: matchId,
    participants: full.info.participants.map((p) => ({
      puuid: p.puuid,
      championId: p.championId,
      win: p.win,
    })),
  }
  await writeFile(path, JSON.stringify(slim))
  return slim
}

async function recentChampStats(puuid) {
  const ids = await riot(
    `https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${MATCH_COUNT}`,
  )

  const tally = new Map() // championId -> { games, wins }
  for (const id of ids) {
    let m
    try {
      m = await cachedMatch(id)
    } catch {
      continue // one bad match shouldn't sink the whole sync
    }
    const me = m.participants.find((p) => p.puuid === puuid)
    if (!me) continue
    const cur = tally.get(me.championId) ?? { games: 0, wins: 0 }
    cur.games++
    if (me.win) cur.wins++
    tally.set(me.championId, cur)
  }
  return tally
}

/* ── main ───────────────────────────────────────────────────── */

/**
 * Everything we can check without spending a Riot API call: does roster.ts parse, are
 * the Riot IDs well-formed, does Data Dragon resolve. Lets you fix typos before burning
 * a key that only lives 24 hours.
 */
async function dryRun() {
  console.log('\n🔍 DRY RUN — no Riot API calls, no key needed\n')

  const roster = await loadRoster()
  const ddragon = await loadDDragon()
  console.log(`   Data Dragon ${ddragon.version} — ${ddragon.byId.size} champions resolved`)

  // Prove the icon URLs the UI builds actually exist.
  const sample = ddragon.byId.get(103) // Ahri
  const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${ddragon.version}/img/champion/${sample.key}.png`
  const iconRes = await fetch(iconUrl, { method: 'HEAD' })
  console.log(`   champion icon CDN: ${iconRes.ok ? '✅' : '❌'} ${iconRes.status} (${sample.name})\n`)

  const withIds = roster.filter((p) => p.riotId)
  const without = roster.filter((p) => !p.riotId)

  console.log(`   ${roster.length} players in roster, ${withIds.length} with a riotId\n`)

  let bad = 0
  let dirty = 0
  for (const p of withIds) {
    const { cleaned, hadInvisible } = cleanRiotId(p.riotId)
    if (hadInvisible) dirty++

    const parts = cleaned.split('#')
    const tagged = parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
    if (!tagged) bad++

    const mark = !tagged ? '❌' : hadInvisible ? '🧹' : '✅'
    const note = !tagged
      ? '  ← no #TAG (will try to guess)'
      : hadInvisible
        ? '  ← had INVISIBLE chars, cleaned'
        : ''
    console.log(
      `   ${mark} ${p.name.padEnd(10)} ${cleaned.padEnd(24)} ${(p.platform ?? DEFAULT_PLATFORM).padEnd(6)}${note}`,
    )
  }

  if (dirty) {
    console.log(
      `\n   🧹 ${dirty} Riot ID(s) carry invisible Unicode (pasted from the League client).`,
    )
    console.log('      The sync strips them automatically — but clean them up in roster.ts.')
  }

  if (without.length) {
    console.log(`\n   no riotId yet (they'll show joke stats instead):`)
    console.log(`     ${without.map((p) => p.name).join(', ')}`)
  }

  console.log('')
  if (bad) {
    console.log(`   ⚠️  ${bad} Riot ID(s) have no #TAG. The sync will try likely defaults,`)
    console.log('      but a guess can land on a stranger — supply the real tag if you can.\n')
  }
  console.log('   Add RIOT_API_KEY to .env, then: npm run sync-stats\n')
  console.log('   NOTE: this only checks the FORMAT. Whether each Riot ID actually exists')
  console.log('   can only be confirmed by a real sync.\n')
}

/**
 * Two people pointing at the same Riot ID means one of them gets the other's rank and
 * champs on their fight card, and nothing about the app would look broken. Hard fail.
 */
function checkDuplicates(withIds) {
  const byId = new Map()
  for (const p of withIds) {
    const key = cleanRiotId(p.riotId).cleaned.toLowerCase()
    if (!byId.has(key)) byId.set(key, [])
    byId.get(key).push(p.name)
  }
  const dupes = [...byId.entries()].filter(([, names]) => names.length > 1)
  if (!dupes.length) return

  console.error('\n❌ DUPLICATE RIOT IDs — two players share one account:\n')
  for (const [riotId, names] of dupes) {
    console.error(`     ${names.join(' and ')}  →  ${riotId}`)
  }
  console.error('\n   One of them would silently show the other\'s rank and champions.')
  console.error('   Fix src/roster.ts before syncing.\n')
  process.exit(1)
}

/**
 * Invisible Unicode formatting characters — bidi isolates, zero-width spaces, BOM.
 *
 * The League client wraps Riot ID tags in LEFT-TO-RIGHT ISOLATE (U+2066) so they render
 * correctly next to right-to-left names. Copy a Riot ID out of the client and that
 * invisible character comes with it, producing "Name#⁦EUW" — which looks identical to
 * "Name#EUW" in an editor but 404s against the API forever.
 *
 * This strips ONLY the format category. Real letters stay: Frodević keeps his ć.
 */
const INVISIBLE = /[​-‏؜‪-‮⁦-⁩﻿]/g

function cleanRiotId(raw) {
  const cleaned = raw.replace(INVISIBLE, '').trim()
  return { cleaned, hadInvisible: cleaned !== raw.trim() }
}

/** Resolve a Riot ID to an account, guessing the #TAG if it's missing. */
async function resolveAccount(p, platform) {
  const { cleaned: raw, hadInvisible } = cleanRiotId(p.riotId)
  if (hadInvisible) scrubbed.push({ name: p.name, cleaned: raw })

  if (raw.includes('#')) {
    const [gameName, tagLine] = raw.split('#')
    if (!gameName || !tagLine) throw new Error(`riotId must look like "Name#TAG", got "${raw}"`)
    const acc = await riot(
      `https://${REGIONAL}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
        `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { allow404: true },
    )
    if (!acc) throw new Error(`"${raw}" not found — check the tag, or the region`)
    return { account: acc, guessed: false, resolvedId: raw }
  }

  // No tag. Try the likely defaults for their platform.
  const candidates = TAG_GUESSES[platform] ?? TAG_GUESSES.euw1
  for (const tag of candidates) {
    const acc = await riot(
      `https://${REGIONAL}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
        `${encodeURIComponent(raw)}/${encodeURIComponent(tag)}`,
      { allow404: true },
    )
    if (acc) return { account: acc, guessed: true, resolvedId: `${raw}#${tag}` }
  }

  throw new Error(
    `no #TAG, and none of [${candidates.join(', ')}] matched — add the real tag to roster.ts`,
  )
}

async function main() {
  if (DRY_RUN) return dryRun()

  apiKey = await loadKey()
  if (!apiKey) {
    console.error('\n❌ No RIOT_API_KEY found.\n')
    console.error('   1. Get a key at https://developer.riotgames.com (free, instant)')
    console.error('   2. Copy .env.example to .env and paste it in\n')
    console.error('   Development keys expire every 24h — re-paste before each sync.\n')
    process.exit(1)
  }

  const roster = await loadRoster()
  const withIds = roster.filter((p) => p.riotId)
  const without = roster.filter((p) => !p.riotId)

  console.log(`\n🥊 SYNCING ${withIds.length} of ${roster.length} players\n`)
  if (without.length) {
    console.log(`   skipping (no riotId in src/roster.ts): ${without.map((p) => p.name).join(', ')}\n`)
  }
  if (!withIds.length) {
    console.error('   Nobody has a `riotId` yet. Add them to src/roster.ts, e.g.:\n')
    console.error("     { id: 'jacob', name: 'JACOB', …, riotId: 'Jacob#EUW' },\n")
    process.exit(1)
  }

  if (WITH_WINRATES) {
    await mkdir(CACHE, { recursive: true })
    const cached = existsSync(CACHE) ? (await readdir(CACHE)).length : 0
    console.log(`   crawling ${MATCH_COUNT} recent matches each for win rates`)
    console.log(`   (${cached} matches already cached — pass --no-winrates to skip entirely)\n`)
  }

  const ddragon = await loadDDragon()
  console.log(`   Data Dragon ${ddragon.version}\n`)

  checkDuplicates(withIds)

  const players = {}
  const failed = []
  const guessedTags = []

  for (const p of withIds) {
    const platform = p.platform ?? DEFAULT_PLATFORM
    process.stdout.write(`\r   ${p.name.padEnd(10)} …                              `)

    try {
      // Riot ID → PUUID (guessing the #TAG if roster.ts didn't supply one)
      const { account, guessed, resolvedId } = await resolveAccount(p, platform)
      const { puuid } = account
      if (guessed) guessedTags.push({ name: p.name, resolvedId })

      // Level + profile icon
      const summoner = await riot(
        `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
        { allow404: true },
      )

      // Ranked. Prefer solo/duo; fall back to flex for people who don't queue solo.
      // Genuinely unranked players get an empty array — that's fine, they just have no rank.
      const entries =
        (await riot(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`, {
          allow404: true,
        })) ?? []
      const soloEntry = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5')
      const flexEntry = entries.find((e) => e.queueType === 'RANKED_FLEX_SR')
      const solo = soloEntry ?? flexEntry
      const queue = soloEntry ? 'SOLO' : 'FLEX'

      // Top 3 champion masteries
      const masteries =
        (await riot(
          `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=3`,
          { allow404: true },
        )) ?? []

      // Recent form, for win rates
      let recent = new Map()
      if (WITH_WINRATES) {
        try {
          recent = await recentChampStats(puuid)
        } catch (e) {
          console.log(`\n   ⚠ ${p.name}: win-rate crawl failed (${e.message}) — keeping mastery only`)
        }
      }

      const topChamps = masteries.map((m) => {
        const champ = ddragon.byId.get(m.championId) ?? {
          key: 'Unknown',
          name: `Champion ${m.championId}`,
        }
        const r = recent.get(m.championId)
        return {
          key: champ.key,
          name: champ.name,
          masteryPoints: m.championPoints,
          masteryLevel: m.championLevel,
          ...(r ? { recent: { games: r.games, wins: r.wins } } : {}),
        }
      })

      players[p.id] = {
        riotId: resolvedId,
        platform,
        ...(summoner ? { level: summoner.summonerLevel, profileIcon: summoner.profileIconId } : {}),
        ...(solo
          ? {
              rank: {
                tier: solo.tier,
                division: solo.rank ?? '',
                lp: solo.leaguePoints,
                wins: solo.wins,
                losses: solo.losses,
                queue,
              },
            }
          : {}),
        topChamps,
        syncedAt: new Date().toISOString(),
      }

      const rankStr = solo
        ? `${solo.tier} ${solo.rank ?? ''} ${solo.leaguePoints}LP${queue === 'FLEX' ? ' (flex)' : ''}`
        : 'UNRANKED'
      const champStr = topChamps.map((c) => c.name).join(', ') || '—'
      const lvl = summoner ? `lv${summoner.summonerLevel}` : ''
      const mark = guessed ? '⚠️ ' : '✅'
      console.log(
        `\r   ${mark} ${p.name.padEnd(10)} ${resolvedId.padEnd(22)} ${lvl.padEnd(6)} ${rankStr.padEnd(22)} ${champStr}`,
      )
    } catch (e) {
      // A dead key isn't this player's problem — it's every player's. Bail immediately
      // instead of printing the same wall of text once per person.
      if (e instanceof FatalApiError) throw e
      console.log(`\r   ❌ ${p.name.padEnd(10)} ${e.message}`)
      failed.push({ name: p.name, reason: e.message })
    }
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify({ ddragonVersion: ddragon.version, players }, null, 2) + '\n',
  )

  console.log(`\n   ${callCount} API calls`)
  console.log(`   wrote ${Object.keys(players).length} players → src/data/playerStats.json`)

  if (scrubbed.length) {
    console.log(`\n   🧹 ${scrubbed.length} Riot ID(s) contained INVISIBLE characters and were cleaned:`)
    console.log('   (copy-pasting from the League client drags a U+2066 bidi marker along —')
    console.log('    it looks identical in an editor but 404s forever. Paste these back into')
    console.log('    src/roster.ts to make it permanent:)\n')
    for (const s of scrubbed) console.log(`     ${s.name.padEnd(10)} riotId: '${s.cleaned}'`)
  }

  if (guessedTags.length) {
    console.log(`\n   ⚠️  ${guessedTags.length} TAG(S) WERE GUESSED — CHECK THESE ARE ACTUALLY YOUR FRIENDS.`)
    console.log('   A name+tag is globally unique, so a guess can land on a total stranger.')
    console.log('   Compare the level/rank above against what you know, then paste the real')
    console.log('   Riot ID into src/roster.ts so it stops guessing:\n')
    for (const g of guessedTags) console.log(`     ${g.name.padEnd(10)} riotId: '${g.resolvedId}'`)
  }

  if (failed.length) {
    console.log(`\n   ❌ ${failed.length} failed:`)
    for (const f of failed) console.log(`     · ${f.name}: ${f.reason}`)
    console.log('\n   These players still work in the app — they just show no live stats.')
  }
  console.log('')
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}\n`)
  process.exit(1)
})
