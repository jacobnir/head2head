/**
 * Riot API helpers shared by /api/ranks and /api/players. Files starting with `_` are
 * not routes on Vercel. The key is only ever read from process.env.RIOT_API_KEY.
 */

const REGIONAL = { euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', kr: 'asia', jp1: 'asia' }
export const PLATFORMS = Object.keys(REGIONAL)

/** Same rule as src/lib/riotId.ts: the League client smuggles invisible bidi marks into tags. */
const INVISIBLE = /[​-‏؜‪-‮⁦-⁩﻿]/g
export const cleanRiotId = (raw) => String(raw ?? '').replace(INVISIBLE, '').replace(/\s+#/, '#').replace(/#\s+/, '#').trim()

// PUUIDs never change for a given key, so a warm instance skips the account lookup.
const puuidCache = new Map()

export class RateLimited extends Error {}

async function riot(url, key) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': key } })
  if (res.status === 429) throw new RateLimited('rate limited')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Riot ${res.status}`)
  return res.json()
}

/**
 * undefined = couldn't find the account (keep whatever rank the page already has),
 * null = found and unranked, otherwise a RankInfo shaped like the sync writes it.
 */
export async function rankFor(player, key) {
  const platform = player.platform || 'euw1'
  let puuid = puuidCache.get(player.riotId)
  if (!puuid) {
    const [gameName, tagLine] = player.riotId.split('#')
    if (!gameName || !tagLine) return undefined
    const account = await riot(`https://${REGIONAL[platform] ?? 'europe'}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, key)
    if (!account) return undefined
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
