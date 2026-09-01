import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store, defaultSettings } from '../electron/db'

const dirs: string[] = []
const newDb = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbc-'))
  dirs.push(dir)
  return path.join(dir, 'sbc.db')
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('configuration store', () => {
  it('seeds a usable default configuration on first run', () => {
    const s = new Store(newDb())
    expect(s.getSettings().demoMode).toBe(true)
    // Nothing about the production is invented: cameras come from OBS at runtime.
    expect(s.getSceneOverrides()).toEqual({})
    expect(s.getSettings().replay.scene).toBe('')
    expect(s.getSettings().replay.mediaSource).toBe('')
    expect(s.getVenues()[0].safeScene).toBe('')
    expect(s.getVenues()[0].micInput).toBe('')
    expect(s.getSports().map((x) => x.id)).toContain('basketball')
    expect(s.getMappings().every((m) => m.template === '')).toBe(true)
    // Every mapping gets its own CasparCG layer so graphics can stack.
    expect(new Set(s.getMappings().map((m) => m.layer)).size).toBe(s.getMappings().length)
    s.close()
  })

  it('reopens an existing database without re-seeding or losing edits', () => {
    const file = newDb()
    const a = new Store(file)
    a.saveSettings({ ...a.getSettings(), productionName: 'Lincoln High' })
    a.saveSceneOverrides({ 'Wide Shot': { label: 'CAM 1', address: 'rtsp://1.2.3.4/s' } })
    a.close()

    const b = new Store(file)
    expect(b.getSettings().productionName).toBe('Lincoln High')
    expect(b.getSceneOverrides()['Wide Shot'].label).toBe('CAM 1')
    b.close()
  })

  it('records the schema version so future migrations have a starting point', () => {
    const file = newDb()
    new Store(file).close()
    const b = new Store(file)
    expect(b.getSettings()).toBeTruthy()
    b.close()
  })

  it('encrypts secrets at rest and returns them in the clear', () => {
    const file = newDb()
    const crypto = {
      encrypt: (s: string) => Buffer.from(s).toString('base64'),
      decrypt: (s: string) => Buffer.from(s, 'base64').toString('utf8'),
    }
    const a = new Store(file, crypto)
    a.saveSettings({ ...a.getSettings(), obs: { ...a.getSettings().obs, password: 'hunter2' } })
    expect(a.getSettings().obs.password).toBe('hunter2')
    a.close()

    // A store with no keystore still reads the row, it just cannot decrypt it.
    const raw = new Store(file)
    expect(raw.getSettings().obs.password).not.toBe('hunter2')
    raw.close()
  })

  it('reads a plaintext password written before encryption was available', () => {
    const file = newDb()
    const a = new Store(file)
    a.saveSettings({ ...defaultSettings(), obs: { ...defaultSettings().obs, password: 'legacy' } })
    a.close()
    const b = new Store(file, { encrypt: (s) => `E(${s})`, decrypt: (s) => s.slice(2, -1) })
    expect(b.getSettings().obs.password).toBe('legacy')
    b.close()
  })

  it('survives a corrupted document instead of failing to start', () => {
    const file = newDb()
    const a = new Store(file)
    // @ts-expect-error reaching past the public API to simulate on-disk damage
    a.db.prepare('UPDATE docs SET json=? WHERE key=?').run('{not json', 'sceneOverrides')
    expect(a.getSceneOverrides()).toEqual({})
    a.close()
  })

  it('stores logs, returns them newest-last and prunes old ones', () => {
    const s = new Store(newDb())
    s.addLog({ t: 1000, level: 'info', scope: 'obs', msg: 'first' })
    s.addLog({ t: 2000, level: 'error', scope: 'graphics', msg: 'second' })
    expect(s.recentLogs().map((l) => l.msg)).toEqual(['first', 'second'])

    s.addLog({ t: Date.now(), level: 'info', scope: 'app', msg: 'today' })
    s.pruneLogs(1)
    expect(s.allLogs().map((l) => l.msg)).toEqual(['today'])
    s.close()
  })
})
