import { describe, expect, it } from 'vitest'
import { comboOf } from '../src/lib/keys'
import { defaultSettings } from '../electron/db'

const key = (k: string, mod: Partial<KeyboardEvent> = {}) => comboOf({ key: k, ...mod } as KeyboardEvent)

describe('hotkey combos', () => {
  it('matches the shipped default bindings', () => {
    const defaults = defaultSettings().hotkeys
    expect(defaults[key('1')]).toBe('camera:1')
    expect(defaults[key('R')]).toBe('replay:last')
    expect(defaults[key('r')]).toBe('replay:last')
    expect(defaults[key('F1')]).toBe('graphics:scoreboard')
    expect(defaults[key('Escape')]).toBe('graphics:clear')
    expect(defaults[key('R', { ctrlKey: true, shiftKey: true })]).toBe('record:toggle')
    expect(defaults[key('L', { ctrlKey: true, shiftKey: true })]).toBe('stream:start')
  })

  it('never binds stopping a live stream', () => {
    expect(Object.values(defaultSettings().hotkeys)).not.toContain('stream:stop')
  })

  it('orders modifiers consistently so bindings are stable', () => {
    expect(key('x', { ctrlKey: true, shiftKey: true, altKey: true })).toBe('Ctrl+Shift+Alt+X')
    expect(key('ArrowUp', { altKey: true })).toBe('Alt+ArrowUp')
  })
})
