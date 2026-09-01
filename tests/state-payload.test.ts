import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store } from '../electron/db'
import { Hub } from '../electron/hub'

let dir: string
let hub: Hub
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'sbc-payload-'))
  hub = new Hub(new Store(path.join(dir, 'sbc.db')))
  await hub.startup()
})
afterEach(async () => {
  await hub.shutdown()
  rmSync(dir, { recursive: true, force: true })
})

/**
 * The hot snapshot goes to every window on every state change, about once a
 * second while OBS is polled. Logs and sport profiles were 89% of its bytes and
 * change almost never, so they must not ride along.
 */
describe('state push payload', () => {
  const hotBytes = () => {
    const { logs, sports, ...hot } = hub.state
    void logs
    void sports
    return JSON.stringify(hot).length
  }

  it('stays small even after a long session fills the log', () => {
    for (let i = 0; i < 400; i++) hub.log('info', 'obs', `line ${i} with a realistic amount of message text in it`)
    expect(hub.state.logs.length).toBe(400)
    // Whole state would be ~55 kB; the hot part must stay an order of magnitude smaller.
    expect(hotBytes()).toBeLessThan(12_000)
  })

  it('keeps the log bounded so the cold channel cannot grow without limit', () => {
    for (let i = 0; i < 5_000; i++) hub.log('info', 'obs', `line ${i}`)
    expect(hub.state.logs.length).toBe(400)
  })

  it('replaces the log and sports arrays rather than mutating, so identity checks detect change', () => {
    const logsBefore = hub.state.logs
    const sportsBefore = hub.state.sports
    hub.log('info', 'test', 'one')
    expect(hub.state.logs).not.toBe(logsBefore)
    // Sports are untouched by logging, so the cold channel stays quiet for them.
    expect(hub.state.sports).toBe(sportsBefore)
  })

  it('main strips both slices from the hot channel', () => {
    const main = readFileSync(path.resolve(import.meta.dirname, '../electron/main.ts'), 'utf8')
    expect(main).toMatch(/const \{ logs, sports, \.\.\.hot \} = state/)
    expect(main).toMatch(/send\('sbc:state', hot\)/)
  })
})
