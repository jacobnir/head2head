/**
 * GET /api/ranks: live ranked data for the roster, for the hosted site.
 *
 * Vercel serverless function. The Riot key stays HERE, in a Vercel environment variable
 * (RIOT_API_KEY); the browser only ever sees ranks, never the key. Riot's policy forbids
 * shipping a key to the client, and anything in the page bundle is public.
 *
 * Who to look up: the Riot IDs the sync already resolved and cleaned (`_players.js`,
 * generated at deploy), plus anyone added on the live site (`_store.js`).
 *
 * The response is cached at Vercel's edge for 10 minutes and served stale while it
 * refreshes, so Riot sees at most one refresh per 10 minutes however many people load
 * the page: ~2 calls per player, well inside a personal key's 100 per 2 minutes.
 *
 * Partial is fine: a player missing from `ranks` just keeps the rank baked into the
 * build. `null` means "fetched, and genuinely unranked right now".
 */
import { PLAYERS } from './_players.js'
import { RateLimited, rankFor } from './_riot.js'
import { readPlayers } from './_store.js'

const BATCH = 5 // players in flight at once: 10 calls, comfortably under 20/s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function everyone() {
  try {
    const known = new Set(PLAYERS.map((p) => p.id))
    const live = (await readPlayers()).filter((p) => p.riotId && !known.has(p.id))
    return [...PLAYERS, ...live.map(({ id, riotId, platform }) => ({ id, riotId, platform }))]
  } catch {
    return PLAYERS // Blob trouble must not take the built-in roster's ranks down with it
  }
}

export default async function handler(_req, res) {
  const key = process.env.RIOT_API_KEY?.trim()
  if (!key) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ error: 'RIOT_API_KEY is not set on this deployment.' })
  }

  const players = await everyone()
  const ranks = {}
  let failures = 0
  let rateLimited = false
  for (let i = 0; i < players.length && !rateLimited; i += BATCH) {
    await Promise.all(players.slice(i, i + BATCH).map(async (p) => {
      try {
        const rank = await rankFor(p, key)
        if (rank !== undefined) ranks[p.id] = rank
      } catch (e) {
        failures++
        if (e instanceof RateLimited) rateLimited = true
      }
    }))
    if (i + BATCH < players.length) await sleep(600)
  }

  const fetched = Object.keys(ranks).length
  // A bad key or total outage: don't cache the failure for 10 minutes.
  res.setHeader('Cache-Control', fetched ? 's-maxage=600, stale-while-revalidate=3000' : 'no-store')
  res.status(fetched ? 200 : 502).json({ fetchedAt: new Date().toISOString(), ranks, failures, rateLimited })
}
