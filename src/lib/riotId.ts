/**
 * Riot ID hygiene. Shared by the Add Player form (browser) and the sync script (node),
 * which bundles this file with esbuild — one source of truth for the rules.
 */

/**
 * Invisible Unicode formatting characters: bidi isolates, zero-width spaces, BOM.
 *
 * The League client wraps Riot ID tags in LEFT-TO-RIGHT ISOLATE (U+2066) so they render
 * correctly beside right-to-left names. Copy a Riot ID out of the client and that
 * invisible character rides along, giving you "Name#⁦EUW" — which looks IDENTICAL to
 * "Name#EUW" in any editor but 404s against the API forever.
 *
 * This has now bitten five different players, so it gets stripped at every entry point.
 * Only the format category is removed — real letters survive (Frodević keeps his ć,
 * Ramsö his ö, Gúthwinë her ë).
 */
const INVISIBLE = /[​-‏؜‪-‮⁦-⁩﻿]/g

export function cleanRiotId(raw: string): string {
  return raw.replace(INVISIBLE, '').trim()
}

export function hasInvisible(raw: string): boolean {
  return INVISIBLE.test(raw)
}

export type RiotIdCheck =
  | { ok: true; value: string; cleaned: boolean }
  | { ok: false; reason: string }

/** Validate a Riot ID for the Add Player form. Empty is allowed — it's optional. */
export function checkRiotId(raw: string): RiotIdCheck {
  const cleaned = cleanRiotId(raw)
  if (!cleaned) return { ok: true, value: '', cleaned: false }

  const parts = cleaned.split('#')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'Needs the tag too — like Name#EUW' }
  }
  if (parts[1].length > 5) {
    return { ok: false, reason: 'Tag looks too long (max 5 characters)' }
  }

  return { ok: true, value: cleaned, cleaned: cleaned !== raw.trim() }
}

/** Stable, filesystem-safe id from a display name. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: Ramsö → Ramso
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
