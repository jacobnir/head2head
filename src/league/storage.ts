import type { League } from './types'

export const LEAGUE_STORAGE_KEY = 'fightnight.leagues.v1'
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export type LoadedLeagues = { leagues: League[]; error: string | null }

function isLeague(value: unknown): value is League {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.version === 1 && typeof v.id === 'string' && typeof v.name === 'string' &&
    Array.isArray(v.players) && Array.isArray(v.matches) && !!v.rules && typeof v.rules === 'object'
}

/**
 * An unreadable save is reported, never replaced: saving is refused until it's dealt
 * with, so one bad parse can't wipe a league that's halfway through the night.
 */
export function readLeagues(storage: StoragePort): LoadedLeagues {
  try {
    const raw = storage.getItem(LEAGUE_STORAGE_KEY)
    if (raw === null) return { leagues: [], error: null }
    const value: unknown = JSON.parse(raw.replace(/^﻿/, ''))
    if (!Array.isArray(value) || !value.every(isLeague)) throw new Error('Saved leagues are not in the expected format.')
    return { leagues: value, error: null }
  } catch (error) {
    return { leagues: [], error: error instanceof Error ? error.message : 'League storage is unavailable.' }
  }
}

export function writeLeagues(storage: StoragePort, leagues: League[]) {
  const current = readLeagues(storage)
  if (current.error) throw new Error(`Not saving over an unreadable save: ${current.error}`)
  try {
    storage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(leagues))
  } catch (error) {
    // Wallpapers are the only big thing in here, so that's the lever to suggest.
    if (error instanceof DOMException && /quota/i.test(error.name + error.message))
      throw new Error('This browser is out of save space. Remove a wallpaper from an old league (or delete the league) and try again.')
    throw error
  }
}
