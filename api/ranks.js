/**
 * GET /api/ranks: live ranked data for the roster, for the hosted site.
 *
 * Vercel serverless function. The Riot key stays HERE, in a Vercel environment variable
 * (RIOT_API_KEY); the browser only ever sees ranks, never the key. Riot's policy forbids
 * shipping a key to the client, and anything in the page bundle is public.
 *
 * Who to look up comes from `_players.js`, generated at deploy time from the Riot IDs the
 * sync already resolved and cleaned (see scripts/deploy.mjs). So no tag guessing or
 * invisible-Unicode scrubbing is needed here.
 *
 * The response is cached at Vercel's edge for 10 minutes and served stale while it
 * refreshes, so Riot sees at most one refresh per 10 minutes however many people load
 * the page: ~2 calls per player, well inside a personal key's 100 per 2 minutes.
 *
 * Partial is fine: a player missing from `ranks` just keeps the rank baked into the
 * build. `null` means "fetched, and genuinely unranked right now".
 */
import { PLAYERS } from './_players.js'

const REGIONAL = { euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', kr: 'asia', jp1: 'asia' }
const BATCH = 5 // players in flight at once: 10 calls, comfortably under 20/s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// PUUIDs never change for a given key, so a warm instance skips the account lookup.
const puuidCache = new Map()

class RateLimited extends Error {}

async function riot(url, key) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': key } })
  if (res.status === 429) throw new RateLimited('rate limited')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Riot ${res.status}`)
  return res.json()
}

async function rankFor(player, key) {
  const platform = player.platform || 'euw1'
  let puuid = puuidCache.get(player.riotId)
  if (!puuid) {
    const [gameName, tagLine] = player.riotId.split('#')
    const account = await riot(`https://${REGIONAL[platform] ?? 'europe'}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, key)
    if (!account) return undefined // renamed or wrong tag: keep the baked rank
    puuid = account.puuid
    puuidCache.set(player.riotId, puuid)
  }
  const entries = (await riot(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`, key)) ?? []
  // Same rule as the sync: solo/duo first, flex for people who don't queue solo.
  const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5')
  const entry = solo ?? entries.find((e) => e.queueType === 'RANKED_FLEX_SR')
  if (!entry) return null
  return { tier: entry.tier, division: entry.rank, lp: entry.leaguePoints, wins: entry.wins, losses: entry.losses, queue: solo ? 'SOLO' : 'FLEX' }
}

export default async function handler(_req, res) {
  const key = process.env.RIOT_API_KEY?.trim()
  if (!key) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ error: 'RIOT_API_KEY is not set on this deployment.' })
  }

  const ranks = {}
  let failures = 0
  let rateLimited = false
  for (let i = 0; i < PLAYERS.length && !rateLimited; i += BATCH) {
    await Promise.all(PLAYERS.slice(i, i + BATCH).map(async (p) => {
      try {
        const rank = await rankFor(p, key)
        if (rank !== undefined) ranks[p.id] = rank
      } catch (e) {
        failures++
        if (e instanceof RateLimited) rateLimited = true
      }
    }))
    if (i + BATCH < PLAYERS.length) await sleep(600)
  }

  const fetched = Object.keys(ranks).length
  // A bad key or total outage: don't cache the failure for 10 minutes.
  res.setHeader('Cache-Control', fetched ? 's-maxage=600, stale-while-revalidate=3000' : 'no-store')
  res.status(fetched ? 200 : 502).json({ fetchedAt: new Date().toISOString(), ranks, failures, rateLimited })
}
