import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CUSTOM = join(ROOT, 'src/data/customPlayers.json')
const OVERRIDES = join(ROOT, 'src/data/playerOverrides.json')
const STATS = join(ROOT, 'src/data/playerStats.json')
const FACES = join(ROOT, 'public/roster')

/**
 * Dev-only API behind the roster screen's "+ ADD PLAYER" button and per-player edit.
 *
 * A browser can't write to the project, so the form posts here and the dev server does the
 * filesystem work.
 *
 *   POST   /api/roster           add a player   -> src/data/customPlayers.json
 *   PUT    /api/roster           edit a player  -> src/data/playerOverrides.json
 *   DELETE /api/roster           remove (custom) or hide (built-in)
 *   POST   /api/roster/restore   un-hide a built-in
 *
 * Edits go to a separate OVERRIDES file rather than mutating roster.ts, because built-in
 * players live in a hand-maintained TypeScript array and codegen into it would eventually
 * eat someone's comments. roster.ts layers the overrides on at import, so both files feed
 * the same ROSTER — including for `npm run sync-stats`, which bundles roster.ts.
 *
 * Only mounted in `npm run dev`. A production build has no server.
 */
export function rosterApi() {
  return {
    name: 'roster-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/api/roster', async (req, res) => {
        const send = (code, payload) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }

        // Mounted at /api/roster, so req.url is the remainder ('/' or '/restore').
        const restore = (req.url ?? '/').startsWith('/restore')

        try {
          const body = JSON.parse(await readBody(req))

          let result
          if (req.method === 'DELETE') result = await deletePlayer(body)
          else if (req.method === 'PUT') result = await editPlayer(body)
          else if (req.method === 'POST' && restore) result = await restorePlayer(body)
          else if (req.method === 'POST') result = await addPlayer(body)
          else return send(405, { error: 'POST add, PUT edit, DELETE remove' })

          send(200, result)
        } catch (e) {
          send(400, { error: e.message })
        }
      })
    },
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 20_000_000) reject(new Error('Image too large (max ~15MB)'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/* ── json helpers ───────────────────────────────────────────── */

/**
 * Read a JSON file we own. Tolerates a BOM (editors and PowerShell add them), but throws
 * on anything else — a caller that can't read the current state must not blindly write
 * over it. This is the lesson from the sync that once replaced 12 players with 1.
 */
async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  const raw = (await readFile(path, 'utf8')).replace(/^﻿/, '')
  if (!raw.trim()) return fallback
  return JSON.parse(raw)
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

/** The merged roster, straight from the app's own source of truth. */
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
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  )
  return mod.ROSTER
}

/* ── image ──────────────────────────────────────────────────── */

async function saveFace(id, imageDataUrl) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(imageDataUrl)
  if (!m) throw new Error('Unsupported image type — use PNG, JPG, WEBP or GIF')

  await mkdir(FACES, { recursive: true })
  await writeFile(join(FACES, `${id}.png`), Buffer.from(m[2], 'base64'))

  // Replacing a photo reuses the same filename, so bust the cache — otherwise the browser
  // (and trimFace's src-keyed cache) would keep showing the old face.
  return `/roster/${id}.png?v=${Date.now()}`
}

/* ── add ────────────────────────────────────────────────────── */

async function addPlayer({ id, name, nickname, riotId, platform, imageDataUrl }) {
  if (!id || !name) throw new Error('Name is required')

  const roster = await loadRoster()
  if (roster.some((p) => p.id === id)) {
    throw new Error(`"${name}" is already on the roster`)
  }

  const custom = await readJson(CUSTOM, [])
  const img = imageDataUrl ? await saveFace(id, imageDataUrl) : null

  custom.push({
    id,
    name: name.toUpperCase(),
    ...(nickname ? { nickname } : {}),
    ...(img ? { img } : {}), // no photo → roster.ts falls back to the placeholder
    ...(riotId ? { riotId } : {}),
    ...(platform && platform !== 'euw1' ? { platform } : {}),
  })
  await writeJson(CUSTOM, custom)

  const { synced, syncNote } = await maybeSync(id, Boolean(riotId))
  return { synced, syncNote }
}

/* ── edit ───────────────────────────────────────────────────── */

async function editPlayer({ id, name, nickname, riotId, platform, imageDataUrl }) {
  if (!id) throw new Error('Missing player id')

  const roster = await loadRoster()
  const current = roster.find((p) => p.id === id)
  if (!current) throw new Error(`No player with id "${id}"`)

  if (!name || !name.trim()) throw new Error('Name is required')

  const overrides = await readJson(OVERRIDES, {})
  const next = { ...(overrides[id] ?? {}) }

  next.name = name.trim().toUpperCase()
  // null (not undefined) is how we record "cleared" — see PlayerOverride in types.ts.
  next.nickname = nickname?.trim() ? nickname.trim() : null
  next.riotId = riotId?.trim() ? riotId.trim() : null
  next.platform = platform && platform !== 'euw1' ? platform : null

  if (imageDataUrl) next.img = await saveFace(id, imageDataUrl)

  overrides[id] = next
  await writeJson(OVERRIDES, overrides)

  // The Riot ID is what every live stat hangs off, so a change to it invalidates them.
  const before = current.riotId ?? null
  const after = next.riotId
  let synced = false
  let syncNote = null

  if (after && after !== before) {
    ;({ synced, syncNote } = await maybeSync(id, true))
  } else if (!after && before) {
    // Unlinked — drop their stale rank/champs rather than leaving a ghost on the card.
    await dropStats(id)
    syncNote = 'Riot ID removed — live stats cleared for this player'
  }

  return { synced, syncNote }
}

/* ── delete / restore ───────────────────────────────────────── */

async function deletePlayer({ id }) {
  if (!id) throw new Error('Missing player id')

  const custom = await readJson(CUSTOM, [])
  const overrides = await readJson(OVERRIDES, {})
  const wasCustom = custom.some((p) => p.id === id)

  if (wasCustom) {
    // Added from the UI, so it's ours to remove outright.
    await writeJson(CUSTOM, custom.filter((p) => p.id !== id))
    delete overrides[id]
    await writeJson(OVERRIDES, overrides)

    // Their face is ours too — nothing else can reference it.
    const face = join(FACES, `${id}.png`)
    if (existsSync(face)) await rm(face, { force: true })

    await dropStats(id)
    return { removed: true, hidden: false }
  }

  // Built-in: declared in roster.ts, which we don't rewrite. Hide instead, and keep the
  // photo and stats so restoring brings them back whole.
  overrides[id] = { ...(overrides[id] ?? {}), hidden: true }
  await writeJson(OVERRIDES, overrides)

  return { removed: false, hidden: true }
}

async function restorePlayer({ id }) {
  if (!id) throw new Error('Missing player id')

  const overrides = await readJson(OVERRIDES, {})
  if (!overrides[id]?.hidden) throw new Error(`"${id}" is not hidden`)

  delete overrides[id].hidden
  // An override with nothing left in it is just noise.
  if (Object.keys(overrides[id]).length === 0) delete overrides[id]

  await writeJson(OVERRIDES, overrides)
  return { restored: true }
}

/* ── stats ──────────────────────────────────────────────────── */

async function maybeSync(id, hasRiotId) {
  if (!hasRiotId) return { synced: false, syncNote: null }

  if (!existsSync(join(ROOT, '.env'))) {
    return {
      synced: false,
      syncNote: 'No .env — add a RIOT_API_KEY and run `npm run sync-stats` for live stats',
    }
  }

  try {
    await runSync(id)
    return { synced: true, syncNote: null }
  } catch (e) {
    return { synced: false, syncNote: e.message }
  }
}

/** Remove one player's live stats, leaving everyone else's alone. */
async function dropStats(id) {
  let stats
  try {
    stats = await readJson(STATS, null)
  } catch {
    // Unreadable — do nothing rather than risk rewriting the file into a worse state.
    return
  }
  if (!stats?.players?.[id]) return

  delete stats.players[id]
  await writeJson(STATS, stats)
}

/** Shell out to the existing sync script for just this player. */
function runSync(id) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/sync-stats.mjs', `--only=${id}`, '--no-winrates'],
      { cwd: ROOT },
    )

    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('sync timed out — run `npm run sync-stats` manually'))
    }, 60_000)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      const reason =
        out.match(/rejected the key \(\d+\)/)?.[0] ??
        out.match(/"[^"]*" not found[^\n]*/)?.[0] ??
        'sync failed — run `npm run sync-stats` to see why'
      reject(new Error(reason))
    })

    child.on('error', () => {
      clearTimeout(timer)
      reject(new Error('could not start the sync script'))
    })
  })
}
