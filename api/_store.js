/**
 * Live-added players, kept in the project's Vercel Blob store (in-house-players).
 *
 *   players/<id>/<timestamp>.json   one file per save; the newest wins
 *   photos/<id>/<timestamp>.png     their face
 *
 * Every save writes a NEW path instead of overwriting, because public blob URLs are
 * CDN-cached: an overwritten file could be served stale for a while, a new path can't.
 * Older versions are deleted right after. The SDK reads BLOB_READ_WRITE_TOKEN, which
 * Vercel injected when the store was connected to the project.
 */
import { del, list, put } from '@vercel/blob'

async function listAll(prefix) {
  const blobs = []
  let cursor
  do {
    const page = await list({ prefix, cursor, limit: 1000 })
    blobs.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return blobs
}

export async function readPlayers() {
  const latest = new Map()
  for (const b of await listAll('players/')) {
    const m = b.pathname.match(/^players\/([^/]+)\/(\d+)\.json$/)
    if (!m) continue
    const seen = latest.get(m[1])
    if (!seen || Number(m[2]) > seen.ts) latest.set(m[1], { ts: Number(m[2]), url: b.url })
  }
  const players = await Promise.all([...latest.values()].map(async ({ url }) => {
    const res = await fetch(url)
    return res.ok ? res.json() : null
  }))
  return players.filter(Boolean).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function savePhoto(id, bytes, contentType) {
  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png'
  const blob = await put(`photos/${id}/${Date.now()}.${ext}`, bytes, { access: 'public', addRandomSuffix: false, contentType })
  return blob.url
}

export async function savePlayer(player) {
  const blob = await put(`players/${player.id}/${Date.now()}.json`, JSON.stringify(player),
    { access: 'public', addRandomSuffix: false, contentType: 'application/json' })
  // Only now drop the older versions and photos, so a failed write never loses anyone.
  const stale = (await listAll(`players/${player.id}/`)).filter((b) => b.url !== blob.url)
  const photos = (await listAll(`photos/${player.id}/`)).filter((b) => b.url !== player.img)
  if (stale.length || photos.length) await del([...stale, ...photos].map((b) => b.url))
}

export async function deletePlayer(id) {
  const all = [...await listAll(`players/${id}/`), ...await listAll(`photos/${id}/`)]
  if (all.length) await del(all.map((b) => b.url))
  return all.length > 0
}
