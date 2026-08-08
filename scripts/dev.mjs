/**
 * `npm run dev` entry point.
 *
 * Kicks off a live-stats sync IN THE BACKGROUND, then starts Vite immediately. The app
 * opens at once on whatever playerStats.json already exists (so startup is never blocked
 * and it still works offline), and when the sync lands Vite hot-reloads the fresh ranks.
 *
 * This does NOT change the runtime invariant: the browser still only imports the JSON and
 * never calls Riot. The sync is a separate Node process that runs at launch — no latency
 * mid-reveal, no key needed just to play.
 *
 * The sync is failure-tolerant on purpose: an expired key or no connection just leaves the
 * existing stats in place and logs why. It never takes the app down with it.
 *
 * It runs with --merge so a player who can't be fetched this launch (Riot outage, one bad
 * account) keeps their previous rank rather than being dropped — the "fall back to the old
 * ranks" behaviour. A total loss of connectivity fails before writing anything, so the
 * existing file is left untouched either way.
 *
 * Extra args pass through to the sync, so `npm run dev -- --no-winrates` refreshes ranks
 * fast, and `npm run dev -- --no-sync` skips it entirely.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const passthrough = process.argv.slice(2)
const skipSync = passthrough.includes('--no-sync') || process.env.H2H_NO_SYNC === '1'
const syncArgs = passthrough.filter((a) => a !== '--no-sync')

/** Background stats refresh — must never block or break app startup. */
let sync
if (!skipSync) {
  console.log('🔄 refreshing live stats in the background (npm run dev -- --no-sync to skip)\n')
  // Merge by default so failed players fall back to their old rank. --only already merges.
  const merge = syncArgs.some((a) => a === '--merge' || a.startsWith('--only=')) ? [] : ['--merge']
  sync = spawn(process.execPath, [join(ROOT, 'scripts/sync-stats.mjs'), ...merge, ...syncArgs], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  sync.on('error', (e) => console.warn(`⚠ stats sync could not start: ${e.message}`))
  sync.on('exit', (code) => {
    if (code) console.warn(`\n⚠ stats sync exited with code ${code} — keeping existing ranks.\n`)
  })
}

/** Vite is the foreground process; its lifetime is the app's. */
const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js')], {
  cwd: ROOT,
  stdio: 'inherit',
})
vite.on('exit', (code) => {
  if (sync && sync.exitCode === null) sync.kill()
  process.exit(code ?? 0)
})
