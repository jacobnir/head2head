import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CUSTOM = join(ROOT, 'src/data/customPlayers.json')
const FACES = join(ROOT, 'public/roster')

/**
 * Dev-only API behind the "Add Player" button.
 *
 * A browser can't write to the project, so the form posts here and the dev server does
 * the filesystem work: saves the face into public/roster/ and appends the player to
 * src/data/customPlayers.json (which roster.ts merges in).
 *
 * Deliberately a separate JSON file rather than rewriting roster.ts — codegen into a
 * hand-edited TypeScript source is a great way to eventually eat someone's comments.
 * The JSON is also visible to `npm run sync-stats`, which bundles roster.ts, so players
 * added from the UI get real ranks and champions like everyone else.
 *
 * Only mounted in `npm run dev`. A production build has no server and no way to persist.
 */
export function rosterApi() {
  return {
    name: 'roster-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/api/roster', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'POST only' }))
          return
        }

        try {
          const body = JSON.parse(await readBody(req))
          const result = await addPlayer(body)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (e) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
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
      // A face PNG as a data URL is big, but not THIS big.
      if (data.length > 20_000_000) reject(new Error('Image too large (max ~15MB)'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function loadCustom() {
  if (!existsSync(CUSTOM)) return []
  try {
    const parsed = JSON.parse(await readFile(CUSTOM, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function addPlayer({ id, name, nickname, riotId, platform, imageDataUrl }) {
  if (!id || !name) throw new Error('Name is required')

  const custom = await loadCustom()

  // The built-in roster is in roster.ts, which we don't parse here — but a clash inside
  // the custom list is ours to catch. (roster.ts collisions surface as a duplicate card,
  // which is visible; a duplicate riotId is the dangerous one and sync-stats hard-fails
  // on that.)
  if (custom.some((p) => p.id === id)) {
    throw new Error(`"${name}" is already on the roster`)
  }

  let img = null

  if (imageDataUrl) {
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(imageDataUrl)
    if (!m) throw new Error('Unsupported image type — use PNG, JPG, WEBP or GIF')

    // Always save as .png: the browser has already re-encoded it to PNG on the canvas,
    // and a single extension keeps public/roster/ predictable.
    await mkdir(FACES, { recursive: true })
    const file = `${id}.png`
    await writeFile(join(FACES, file), Buffer.from(m[2], 'base64'))
    img = `/roster/${file}`
  }

  const player = {
    id,
    name: name.toUpperCase(),
    ...(nickname ? { nickname } : {}),
    ...(img ? { img } : {}), // no image → roster.ts falls back to the placeholder
    ...(riotId ? { riotId } : {}),
    ...(platform && platform !== 'euw1' ? { platform } : {}),
  }

  custom.push(player)
  await mkdir(dirname(CUSTOM), { recursive: true })
  await writeFile(CUSTOM, JSON.stringify(custom, null, 2) + '\n')

  // If they gave us a Riot ID and a key exists, pull their rank right now so the player
  // shows up complete instead of blank until someone remembers to run the CLI.
  let synced = false
  let syncNote = null

  if (riotId) {
    if (existsSync(join(ROOT, '.env'))) {
      try {
        await runSync(id)
        synced = true
      } catch (e) {
        syncNote = e.message
      }
    } else {
      syncNote = 'No .env — add a RIOT_API_KEY and run `npm run sync-stats` for live stats'
    }
  }

  return { player, synced, syncNote }
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

    child.on('close', (code) => {
      if (code === 0) return resolve()
      // Surface the useful line rather than the whole log.
      const reason =
        out.match(/rejected the key \(\d+\)/)?.[0] ??
        out.match(/not found — .*/)?.[0] ??
        'sync failed — run `npm run sync-stats` to see why'
      reject(new Error(reason))
    })

    child.on('error', () => reject(new Error('could not start the sync script')))

    // Don't leave the request hanging if Riot is slow.
    setTimeout(() => {
      child.kill()
      reject(new Error('sync timed out — run `npm run sync-stats` manually'))
    }, 60_000)
  })
}
