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

async function livePlayers() {
  const known = new Set(PLAYERS.map((p) => p.id))
  return (await readPlayers()).filter((p) => p.riotId && !known.has(p.id))
    .map(({ id, riotId, platform }) => ({ id, riotId, platform }))
}

async function everyone() {
  try {
    return [...PLAYERS, ...await livePlayers()]
  } catch {
    return PLAYERS // Blob trouble must not take the built-in roster's ranks down with it
  }
}

/**
 * `?ids=a,b`: just those live-added players, on a short cache. The full list is cached for
 * 10 minutes, so someone added a minute ago isn't in it yet; the page asks for them here.
 * Only live-added ids are honoured, at most 10, so this can't be used to hammer Riot.
 */
async function requested(ids) {
  const wanted = new Set(String(ids).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10))
  return (await livePlayers()).filter((p) => wanted.has(p.id))
}

export default async function handler(req, res) {
  const key = process.env.RIOT_API_KEY?.trim()
  if (!key) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ error: 'RIOT_API_KEY is not set on this deployment.' })
  }

  const subset = req.query?.ids !== undefined
  const players = subset ? await requested(req.query.ids) : await everyone()
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
  if (subset) {
    // Unranked newcomers are a valid empty answer, not a failure.
    res.setHeader('Cache-Control', failures ? 'no-store' : 's-maxage=120, stale-while-revalidate=600')
    return res.status(200).json({ fetchedAt: new Date().toISOString(), ranks, failures, rateLimited })
  }
  // A bad key or total outage: don't cache the failure for 10 minutes.
  res.setHeader('Cache-Control', fetched ? 's-maxage=600, stale-while-revalidate=3000' : 'no-store')
  res.status(fetched ? 200 : 502).json({ fetchedAt: new Date().toISOString(), ranks, failures, rateLimited })
}
