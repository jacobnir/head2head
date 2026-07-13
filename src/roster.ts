import customPlayers from './data/customPlayers.json'
import type { Player } from './types'

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
const CUSTOM: Player[] = (customPlayers as Player[]).map((p) => ({
  ...p,
  img: p.img || PLACEHOLDER_FACE,
}))

export const ROSTER: Player[] = [
  ...BUILT_IN.map((p) => ({ ...p, img: p.img || PLACEHOLDER_FACE })),
  ...CUSTOM,
]

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
