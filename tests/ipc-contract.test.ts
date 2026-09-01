import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n)
    return statSync(f).isDirectory() ? walk(f) : [f]
  })

/**
 * The renderer reaches the main process through one channel with a string
 * action name, so a typo is invisible until someone presses the button mid-game.
 * Every name the UI sends must exist in the main-process action map.
 */
describe('IPC action contract', () => {
  const main = readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf8')
  const registered = new Set(
    [...main.matchAll(/^\s*'([a-zA-Z]+\.[a-zA-Z]+)':/gm)].map((m) => m[1]),
  )
  // Names reach act() directly and through ternaries
  // (`act(studio ? 'obs.setPreview' : 'obs.setScene', …)`), so take every string
  // literal on a line that calls act().
  const called = new Map<string, string>()
  for (const file of walk(path.join(ROOT, 'src')).filter((f) => /\.tsx?$/.test(f))) {
    const rel = path.relative(ROOT, file)
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('act(')) continue
      for (const m of line.matchAll(/'([a-zA-Z]+\.[a-zA-Z]+)'/g)) called.set(m[1], rel)
    }
  }

  it('registers a handler for every action the UI calls', () => {
    expect(registered.size).toBeGreaterThan(10)
    const missing = [...called].filter(([name]) => !registered.has(name)).map(([n, f]) => `${n} (${f})`)
    expect(missing).toEqual([])
  })

  it('includes the session actions', () => {
    expect(registered.has('game.new')).toBe(true)
    expect(called.has('game.new')).toBe(true)
  })

  it('has no handler the UI never calls', () => {
    // Dead IPC surface is attack surface and rot; delete it or give it a button.
    const orphans = [...registered].filter((n) => !called.has(n))
    expect(orphans).toEqual([])
  })
})
