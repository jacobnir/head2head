# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local web app that randomizes League of Legends in-house customs: pick exactly 10 players from a roster of friends, and it draws teams + lanes and reveals each head-to-head bout with a boxing-promo animation, then lands on a fight card. It pulls real rank / champion data from Riot's API. It runs on `npm run dev` and gets screen-shared over Discord — there is no deployment.

## Commands

```bash
npm run dev            # the app (localhost:5173)
npm run build          # tsc -b && vite build
npm run verify         # BOTH suites below — run this after touching randomize.ts or stats.ts
npm run sync-stats     # pull live Riot data -> src/data/playerStats.json
npm run preview-odds   # print rank-derived odds + win chances for every possible bout
```

There is **no test framework**. Correctness is enforced by two standalone scripts that
esbuild-bundle the real TypeScript and hammer it — treat these as the test suite:

```bash
npm run verify-randomizer   # 20k rolls: every player used exactly once, teams 5v5,
                            # lanes unique, distribution uniform, curses reconcile
npm run verify-ranks        # all 93 ladder rungs strictly ordered Iron IV -> Challenger
```

Sync flags: `--dry-run` (validate roster + Data Dragon, no key needed), `--no-winrates`
(skip match crawling — much faster), `--only=id1,id2` (partial, merging sync),
`--matches=N`, `--force`.

## Architecture

### Data flow

`src/roster.ts` is the single source of truth for who exists. It merges two sources:

- **`BUILT_IN`** — hand-edited array in `roster.ts` itself.
- **`src/data/customPlayers.json`** — written by the dev-server API behind the app's
  "+ ADD PLAYER" button. Never codegen into `roster.ts`; that's why this file exists.

`src/data/playerStats.json` is **generated** by `npm run sync-stats` and holds live Riot
data (rank, top champions, mastery, win rates). **The app never calls Riot at runtime** —
it imports this JSON. So no API key is needed to play, there's no latency mid-reveal, and
it works offline while screen-sharing. `src/lib/stats.ts` is the only reader.

`scripts/sync-stats.mjs` esbuild-bundles `roster.ts` and `riotId.ts` and imports them in
Node (`loadTs()`), so app code stays the single source of truth for both the roster and
Riot-ID parsing rules. This is also why UI-added players get synced like any other.

### The reveal, and the one invariant that matters

`randomize()` (`src/lib/randomize.ts`) returns `Matchup[]` that is **already final** —
curses have been applied. A cursed matchup carries the *pre-curse* pairing in
`curse.before`, so `LaneReveal` shows `before`, plays the curse animation, then lands on
the matchup's real `blue`/`red`.

**The animation must never contradict the fight card.** `SWAP` and `EARTHQUAKE` genuinely
mutate the assignment; `CURSED_LANE` is cosmetic and carries no `before`. `EARTHQUAKE`
displaces its pair onto a *later* lane specifically so no already-revealed bout is
contradicted. `verify-randomizer` asserts all of this on every roll — if you touch curse
logic, that suite is the safety net.

`RevealScreen` owns an `advanceSignal` counter; `LaneReveal` interprets each increment
against its own phase (`PLAYING` fast-forwards to the finished state, `HOLD` exits to the
next bout). Nothing auto-advances — the user drives it. Beat timings are the `at(ms, …)`
timeline inside `LaneReveal`.

### FX layer

`src/fx/screen.ts` deliberately bypasses React — shake/flash/aberration/hitstop drive CSS
custom properties and classes on `<body>` because they fire dozens of times a second and
re-rendering the tree for each would be silly. `src/fx/particles.ts` is one shared rAF
loop over a fullscreen canvas that idles to zero cost when nothing is alive.

All audio is synthesized in `src/lib/audio.ts` (Web Audio) — no files. The `AudioContext`
can only start after a user gesture, which is the FIGHT NIGHT click.

## Traps that have already bitten

**Invisible Unicode in Riot IDs.** Copying a Riot ID out of the League client drags a
`U+2066 LEFT-TO-RIGHT ISOLATE` along with it. `Name#⁦EUW` and `Name#EUW` are pixel-identical
in any editor but the first 404s against the API forever. This has hit five players.
`src/lib/riotId.ts` strips it at every entry point (the Add Player form and the sync
script both use `cleanRiotId`). Only the *format* category is stripped — real letters
survive (`Frodević`, `Ramsö`, `Gúthwinë`). If a Riot ID mysteriously 404s, hex-dump it first.

**Partial syncs must merge, never clobber.** `--only` merges into the existing
`playerStats.json`. It once silently overwrote 12 players' stats with one, because a stray
BOM made the file unparseable and the error was swallowed. It now tolerates a BOM and
*aborts* on any other parse failure rather than persisting a subset. Don't reintroduce a
"fall back to what we synced" path.

**Never write project files from PowerShell with `Set-Content -Encoding utf8`** — Windows
PowerShell 5.1 adds a UTF-8 BOM. That's what caused the above.

**Face images.** `src/lib/trimFace.ts` auto-crops each PNG to its alpha bounding box at
load, so faces with arbitrary transparent padding all render at a consistent size. This
breaks when a photo includes the **torso** — the crop fits head-and-shoulders into the
frame and the head comes out small. Face-only cutouts are required; crop torso photos
before importing.

**Riot dev keys expire every 24 hours.** A 401 from the sync means the key in `.env` has
lapsed, not that the code is broken. It's only needed for `sync-stats`, never to run the app.

## Conventions

- Deps are deliberately minimal: `react`, `react-dom`, `framer-motion`. The look is fully
  custom CSS (`src/styles/`) — don't add a UI framework.
- `public/roster/` (the faces) is gitignored.
- Fake stats (`TILT RESISTANCE` etc.) and fallback odds are seeded off `playerId + matchSeed`
  so they're stable within a match and fresh on reroll. Real data and fiction are visually
  distinguished in the UI, and unranked players get `NO LINE` rather than an invented number.
- The `vite-plugins/roster-api.mjs` endpoint is `apply: 'serve'` — dev only. A production
  build has no server, and the Add Player form says so.
