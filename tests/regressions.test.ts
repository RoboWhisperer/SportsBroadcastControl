import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store, defaultSettings } from '../electron/db'
import { Hub } from '../electron/hub'

let dir: string
let file: string
let hub: Hub

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'sbc-reg-'))
  file = path.join(dir, 'sbc.db')
  hub = new Hub(new Store(file))
  await hub.startup()
})
afterEach(async () => {
  await hub.shutdown()
  rmSync(dir, { recursive: true, force: true })
})

describe('settings are saved on every keystroke, so reconnecting must not be', () => {
  it('reconnects once after a burst of edits, not once per edit', async () => {
    const reload = vi.spyOn(hub, 'reload')
    // What the UI does while someone types an IP address into the OBS host field.
    for (const host of ['1', '19', '192', '192.', '192.1', '192.16', '192.168.1.50']) {
      await hub.saveSettings({ ...hub.state.settings, obs: { ...hub.state.settings.obs, host } })
    }
    expect(hub.state.settings.obs.host).toBe('192.168.1.50') // persisted immediately
    expect(reload).not.toHaveBeenCalled() // but nothing has torn down a connection yet

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1), { timeout: 4000 })
  }, 10000)

  it('does not reconnect at all for a setting no integration depends on', async () => {
    const reload = vi.spyOn(hub, 'reload')
    await hub.saveSettings({ ...hub.state.settings, productionName: 'Lincoln High' })
    await new Promise((r) => setTimeout(r, 1200))
    expect(reload).not.toHaveBeenCalled()
  }, 10000)
})

describe('idle cost', () => {
  it('does not rewrite the database while nothing is changing', async () => {
    // WAL mode means writes land in sbc.db-wal, not sbc.db.
    const wal = () => statSync(`${file}-wal`).size
    const pushes = () => {
      let n = 0
      hub.on('state', () => n++)
      return () => n
    }
    const count = pushes()
    const before = wal()
    // Camera probing runs every 5s; two cycles with no state change must be silent.
    await new Promise((r) => setTimeout(r, 11_000))
    expect(wal()).toBe(before)
    expect(count()).toBe(0)
  }, 20000)
})

describe('shutdown', () => {
  it('stops the thumbnail loop for good, even mid-capture', async () => {
    // Shut down while a capture is in flight: the loop must not reschedule itself.
    const svc = (hub as unknown as { obs: { getThumbnail: (s: string, w: number) => Promise<string> } }).obs
    vi.spyOn(svc, 'getThumbnail').mockImplementation(() => new Promise((r) => setTimeout(() => r('data:image/x,'), 400)))
    await new Promise((r) => setTimeout(r, 400))
    await hub.shutdown()
    const seen: unknown[] = []
    hub.on('thumbs', (t) => seen.push(t))
    await new Promise((r) => setTimeout(r, 3000))
    expect(seen).toEqual([])
    hub = new Hub(new Store(file)) // afterEach needs something to shut down
  }, 10000)
})

describe('settings migration', () => {
  it('fills in a section key added after the config was written', () => {
    const s = new Store(file)
    const stored = defaultSettings()
    // Simulate a database written by a build that predates the replay settings.
    delete (stored as Partial<typeof stored>).replay
    delete (stored.obs as Partial<typeof stored.obs>).autoConnect
    s.saveSettings(stored as typeof stored)
    const back = s.getSettings()
    expect(back.replay.defaultDuration).toBe(10)
    expect(back.obs.autoConnect).toBe(true)
    s.close()
  })
})
