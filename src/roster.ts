import customPlayers from './data/customPlayers.json'
import playerOverrides from './data/playerOverrides.json'
import type { Player, PlayerOverride } from './types'

/**
 * Shown for anyone without a photo. Drop your own PNG at this path to change it —
 * a transparent cutout works best, like the real faces.
 */
export const PLACEHOLDER_FACE = '/roster/_placeholder.png'

/**
 * ─────────────────────────────────────────────────────────────
 *  THE ONLY FILE YOU NEED TO EDIT
 * ─────────────────────────────────────────────────────────────
 *
 *  To add a friend:
 *    1. Drop their cutout PNG into  public/roster/  (e.g. public/roster/kalle.png)
 *       Transparent background is ideal, but ANY amount of empty padding is fine —
 *       the app auto-crops to the visible pixels at load time.
 *    2. Add a line below.
 *
 *  `nickname` is optional. Leave it out and they get a random hype tag each roll.
 *
 *  ── LIVE STATS (rank, most-played champs, win rates) ─────────
 *
 *  `name` is the DISPLAY name on the fight card — keep it as the person's actual name.
 *  `riotId` is their IN-GAME name, and it must include the tag:  GameName#TAG
 *  (the new Riot ID format, not the old summoner name — it's top-right of their
 *  profile in the client). Both get shown: big name, Riot ID underneath.
 *
 *    Then run:  npm run sync-stats
 *
 *  Entirely optional and per-player. Anyone without a `riotId` just shows the joke
 *  stat bars instead — nothing breaks, they just have no live data.
 *
 *  Everyone defaults to EUW. If someone's on another server: platform: 'eun1'
 *
 *  The roster can hold as many people as you like — you pick exactly 10 per night.
 */
const BUILT_IN: Player[] = [
  { id: 'anton',   name: 'ANTON',   nickname: 'The Anvil',        img: '/roster/anton.png' },
  { id: 'benne',   name: 'BENNE',   nickname: 'Certified Menace', img: '/roster/benne.png' ,   riotId: 'DCG Benne#Pung'},
  { id: 'damjan',  name: 'DAMJAN',  nickname: 'The Balkan Wall',  img: '/roster/damjan.png' },
  { id: 'david',   name: 'DAVID',   nickname: 'Silent Assassin',  img: '/roster/david.png' ,   riotId: 'Ruthless#LMAO'},
  { id: 'emil',    name: 'EMIL',    nickname: 'Moustache Diff',   img: '/roster/emil.png',   riotId: 'VESDRAESTINATOR#EUW' },
  { id: 'frode',   name: 'FRODE',   nickname: 'Ganks Given: 0',   img: '/roster/frode.png' ,   riotId: 'Frodević#EUW'},
  { id: 'henke',   name: 'HENKE',   nickname: 'The Tilt Machine', img: '/roster/henke.png' },
  { id: 'isak',    name: 'ISAK',    nickname: 'Perma Flamed',     img: '/roster/isak.png',   riotId: 'Zliper#1590'},
  { id: 'jacob',   name: 'JACOB',   nickname: 'The Architect',    img: '/roster/jacob.png',   riotId: 'OllePlockarN#EUW' },
  { id: 'jeppe',   name: 'JEPPE',   nickname: 'Flash On D... ish',img: '/roster/jeppe.png' ,   riotId: 'Jopplahontas#EUW' },
  { id: 'ludwig',  name: 'LUDWIG',  nickname: 'Mid Diff Enjoyer', img: '/roster/ludwig.png' },
  { id: 'mcuz',    name: 'MCUZ',    nickname: 'Built Different',  img: '/roster/mcuz.png' },
  { id: 'mugge',   name: 'MUGGE',   nickname: 'The Inting Bear',  img: '/roster/mugge.png' },
  { id: 'noah',    name: 'NOAH',    nickname: 'Max Zoom Menace',  img: '/roster/noah.png',   riotId: 'bonkers#1111' },
  { id: 'oscar',   name: 'OSCAR',   nickname: 'Blinked, Died',    img: '/roster/oscar.png',   riotId: 'Hellworld#2025' },
  { id: 'pippo',   name: 'PIPPO',   nickname: 'Smite Stealer',    img: '/roster/pippo.png',   riotId: 'DCG SuperPippo#DCG' },
  { id: 'simon',   name: 'SIMON',   nickname: 'Wards? Never.',    img: '/roster/simon.png' ,   riotId: 'DCG Ramsö#111' },
  { id: 'thure',   name: 'THURE',   nickname: 'Shades On, Eyes Off', img: '/roster/thure.png',   riotId: 'rowex#036' },
  { id: 'wibring', name: 'WIBRING', nickname: 'The Final Boss',   img: '/roster/wibring.png' },
  { id: 'wille',   name: 'WILLE',   nickname: 'Deadpan Diff',     img: '/roster/wille.png',   riotId: 'WallyWonky#EUW' },
  { id: 'andreas', name: 'ANDREAS', nickname: 'Sleepy discorder', img: '/roster/andreas.png',   riotId: 'Gúthwinë#6925' },

  // Alternate takes are already in public/roster/ if you prefer a different photo —
  // just point the img above at:  isak-alt.png / jeppe-alt.png / mcuz-alt.png / wibring-alt.png
]

/**
 * Players added from the app's "+ ADD PLAYER" button.
 *
 * The dev server writes them to src/data/customPlayers.json rather than editing this
 * file — generating code into a hand-maintained source is how you eventually eat
 * someone's comments. They're first-class either way: `npm run sync-stats` bundles this
 * module, so it sees them too.
 *
 * Anyone without a photo falls back to the placeholder.
 */
const CUSTOM: Player[] = customPlayers as Player[]

/**
 * Edits made from the roster screen (src/data/playerOverrides.json), applied on top of
 * BOTH sources. Built-ins can't be edited in place — roster.ts is hand-maintained and we
 * don't generate code into it — so an override layer is how a built-in gets a new photo,
 * Riot ID or nickname.
 *
 * `null` means the field was explicitly cleared; `undefined` means it was never touched.
 * That distinction is why this isn't a plain spread.
 */
const OVERRIDES = playerOverrides as Record<string, PlayerOverride>

function applyOverride(p: Player): Player {
  const o = OVERRIDES[p.id]
  const merged: Player = { ...p }

  if (o) {
    if (o.name !== undefined) merged.name = o.name
    if (o.nickname !== undefined) merged.nickname = o.nickname ?? undefined
    if (o.img !== undefined) merged.img = o.img ?? ''
    if (o.riotId !== undefined) merged.riotId = o.riotId ?? undefined
    if (o.platform !== undefined) merged.platform = o.platform ?? undefined
  }

  // Anyone with no photo — never had one, or had it cleared — gets the placeholder.
  if (!merged.img) merged.img = PLACEHOLDER_FACE
  return merged
}

const ALL: Player[] = [...BUILT_IN, ...CUSTOM].map(applyOverride)

/** Everyone who shows up on the roster screen. */
export const ROSTER: Player[] = ALL.filter((p) => !OVERRIDES[p.id]?.hidden)

/**
 * Built-in players that have been "deleted" from the UI. They can't be removed for real
 * — roster.ts declares them — so they're hidden, and the roster screen lists them so a
 * mis-click isn't a one-way door.
 */
export const HIDDEN: Player[] = ALL.filter((p) => OVERRIDES[p.id]?.hidden)

/** True when the player came from customPlayers.json rather than the built-in array. */
export function isCustom(id: string): boolean {
  return CUSTOM.some((p) => p.id === id)
}

/** Used for anyone without a nickname, and for the extra stamped tag on the fight card. */
export const HYPE_TAGS = [
  'MID DIFF ENJOYER',
  'PERMA TILTED',
  '0/10 POWER SPIKE',
  'GANK ANDY',
  'FF@15 ADVOCATE',
  'ALT-F4 SPECIALIST',
  'CS: UNKNOWN',
  'RUNS IT DOWN',
  'MENTAL BOOM SPEEDRUN',
  'HARD STUCK',
  'FLASHES INTO WALLS',
  'PINGS TWICE, DIES ONCE',
  'BUILT LIKE A MINION',
  'CHAT RESTRICTED',
  'THE SCAPEGOAT',
  'SMURF (ALLEGEDLY)',
  'WILL BLAME JUNGLE',
  'TOWER DIVE ENTHUSIAST',
]
