import { describe, expect, it } from 'vitest'
import { mergeCold, mergeHot, type Cold, type Hot } from '../src/lib/merge'
import type { AppState, LogEntry, SportProfile } from '../shared/types'

const cold: Cold = {
  logs: [{ t: 1, level: 'info', scope: 'obs', msg: 'connected' }] as LogEntry[],
  sports: [{ id: 'basketball', name: 'Basketball' } as SportProfile],
}
const hot = { settings: { activeSport: 'basketball' }, cameras: [{ id: 'CAM 1' }] } as unknown as Hot

/**
 * State arrives on two channels. Either can land first — a window opened later
 * gets a cold push after its first hot push, while the main window gets cold
 * during load — so the merge must be order independent and never drop a slice.
 */
describe('reassembling state from two channels', () => {
  it('hot then cold', () => {
    let s: AppState | null = null
    s = mergeHot(s, hot)
    expect(s.logs).toEqual([]) // no logs yet, but the page must not crash on undefined
    expect(s.sports).toEqual([])
    s = mergeCold(s, cold)
    expect(s.logs).toHaveLength(1)
    expect(s.sports).toHaveLength(1)
    expect(s.cameras).toHaveLength(1)
  })

  it('cold then hot', () => {
    let s: AppState | null = null
    s = mergeCold(s, cold)
    s = mergeHot(s, hot)
    expect(s.logs).toHaveLength(1)
    expect(s.sports[0].id).toBe('basketball')
    expect(s.settings.activeSport).toBe('basketball')
  })

  it('a later hot push never clears the cold slices', () => {
    let s = mergeCold(mergeHot(null, hot), cold)
    for (let i = 0; i < 5; i++) s = mergeHot(s, hot)
    expect(s.logs).toHaveLength(1)
    expect(s.sports).toHaveLength(1)
  })

  it('a later cold push replaces only its own slices', () => {
    let s = mergeCold(mergeHot(null, hot), cold)
    s = mergeCold(s, { logs: [], sports: cold.sports })
    expect(s.logs).toEqual([])
    expect(s.cameras).toHaveLength(1) // hot data survives
  })

  it('gives pages empty arrays rather than undefined before cold arrives', () => {
    const s = mergeHot(null, hot)
    expect(Array.isArray(s.logs)).toBe(true)
    expect(Array.isArray(s.sports)).toBe(true)
  })
})
