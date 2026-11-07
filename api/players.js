/**
 * /api/players: players added from the hosted site, so the roster can grow without the
 * host's laptop. Built-in players (roster.ts + customPlayers.json at deploy time) are
 * read-only here; they're still edited locally under `npm run dev`.
 *
 *   GET                       → { players }                     (public, briefly cached)
 *   POST   { name, ... }      → { player, rank, note }          add
 *   PUT    { id, name, ... }  → { player, rank, note }          edit a live-added player
 *   DELETE { id }             → { deleted }
 *
 * Writes need the site code in `x-site-code`; it's hashed here and compared with the hash
 * baked in at deploy time, so the plain code is never stored server-side.
 */
import { createHash } from 'node:crypto'
import { RESERVED_IDS, SITE_CODE_SHA256 } from './_config.js'
import { cleanRiotId, PLATFORMS, rankFor } from './_riot.js'
import { deletePlayer, readPlayers, savePhoto, savePlayer } from './_store.js'

const MAX_PHOTO_BYTES = 3_000_000

/** Must match normaliseCode in src/components/SiteGate.tsx. */
const normaliseCode = (code) => String(code ?? '').trim().normalize('NFC').toLowerCase()

/** Same as slugify in src/lib/riotId.ts. */
const slugify = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

class Bad extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function authorised(req) {
  if (!SITE_CODE_SHA256) return true // a deploy without a code gate has nothing to check
  const header = req.headers['x-site-code']
  if (!header) return false
  const code = decodeURIComponent(Array.isArray(header) ? header[0] : header)
  return createHash('sha256').update(normaliseCode(code), 'utf8').digest('hex') === SITE_CODE_SHA256
}

function parseFields(body) {
  const name = String(body.name ?? '').trim().toUpperCase()
  if (!name || name.length > 24) throw new Bad(400, 'Give them a name (up to 24 characters).')
  const nickname = body.nickname ? String(body.nickname).trim().slice(0, 40) : undefined
  const riotId = body.riotId ? cleanRiotId(body.riotId) : undefined
  if (riotId && !/^[^#]{1,16}#[^#\s]{2,5}$/.test(riotId)) throw new Bad(400, 'Riot ID should look like Name#TAG.')
  const platform = PLATFORMS.includes(body.platform) ? body.platform : 'euw1'
  return { name, nickname: nickname || undefined, riotId: riotId || undefined, platform }
}

async function photoFrom(body, id) {
  if (!body.imageDataUrl) return undefined
  const m = String(body.imageDataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) throw new Bad(400, 'That photo isn’t a PNG, JPEG or WebP image.')
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length > MAX_PHOTO_BYTES) throw new Bad(413, 'That photo is too big. Try a smaller one.')
  return savePhoto(id, bytes, m[1])
}

async function withRank(player) {
  const key = process.env.RIOT_API_KEY?.trim()
  if (!player.riotId || !key) return { player, rank: undefined }
  try {
    const rank = await rankFor(player, key)
    return { player, rank, note: rank === undefined ? `Couldn’t find ${player.riotId} on Riot. Check the name and tag.` : undefined }
  } catch {
    return { player, rank: undefined } // Riot hiccup: the next /api/ranks refresh will catch up
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=30')
      return res.status(200).json({ players: await readPlayers() })
    }
    res.setHeader('Cache-Control', 'no-store')
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) throw new Bad(405, 'Method not allowed.')
    if (!authorised(req)) throw new Bad(401, 'Wrong or missing site code. Reload the page and enter it again.')

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
    const live = await readPlayers()
    const now = new Date().toISOString()

    if (req.method === 'DELETE') {
      const id = String(body.id ?? '')
      if (RESERVED_IDS.includes(id)) throw new Bad(403, 'Built-in players can only be removed on the host’s computer.')
      if (!live.some((p) => p.id === id)) throw new Bad(404, 'That player isn’t on the live roster.')
      return res.status(200).json({ deleted: await deletePlayer(id) })
    }

    const fields = parseFields(body)
    if (req.method === 'POST') {
      const id = slugify(fields.name)
      if (!id) throw new Bad(400, 'That name needs at least one letter or number.')
      if (RESERVED_IDS.includes(id) || live.some((p) => p.id === id)) throw new Bad(409, `${fields.name} is already on the roster.`)
      const img = await photoFrom(body, id)
      const player = { id, ...fields, ...(img ? { img } : {}), createdAt: now, updatedAt: now }
      await savePlayer(player)
      return res.status(201).json(await withRank(player))
    }

    // PUT
    const id = String(body.id ?? '')
    if (RESERVED_IDS.includes(id)) throw new Bad(403, 'Built-in players can only be edited on the host’s computer.')
    const existing = live.find((p) => p.id === id)
    if (!existing) throw new Bad(404, 'That player isn’t on the live roster.')
    const img = (await photoFrom(body, id)) ?? existing.img
    const player = { ...existing, ...fields, ...(img ? { img } : {}), updatedAt: now }
    for (const k of ['nickname', 'riotId']) if (fields[k] === undefined) delete player[k]
    await savePlayer(player)
    return res.status(200).json(await withRank(player))
  } catch (e) {
    const status = e instanceof Bad ? e.status : 500
    if (status === 500) console.error(e)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(status).json({ error: e instanceof Bad ? e.message : 'Something went wrong saving. Try again.' })
  }
}
