import { afterEach, describe, expect, it } from 'vitest'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SchemaTooNewError, Store } from '../electron/db'
import { Hub } from '../electron/hub'

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/v1.0.1-schema1.db')
const dirs: string[] = []

/** A writable copy of a shipped release's database. */
function openFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbc-mig-'))
  dirs.push(dir)
  const file = path.join(dir, 'sbc.db')
  copyFileSync(FIXTURE, file)
  return file
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/**
 * The acceptance test for Phase 0.1 of UPGRADE_PLAN.md: a database written by
 * the previous release must open under this build with everything intact.
 */
describe('upgrading a database from 1.0.1 (schema 1)', () => {
  it('opens it and reports the current format', () => {
    const s = new Store(openFixture())
    expect(s.schemaVersion()).toBe(2)
    s.close()
  })

  it('records which migrations it ran, so an upgrade is not silent', () => {
    const s = new Store(openFixture())
    expect(s.applied).toEqual(['2: drop documents superseded before 1.0.0'])
    s.close()
  })

  it('keeps settings, including the ones that point at real equipment', () => {
    const s = new Store(openFixture())
    const c = s.getSettings()
    expect(c.productionName).toBe('Lincoln High School Broadcasting')
    expect(c.obs).toMatchObject({ host: '192.168.1.20', port: 4455 })
    expect(c.graphics).toMatchObject({ host: '192.168.1.21', channel: 1 })
    expect(c.replay).toMatchObject({ scene: 'REPLAY', mediaSource: 'Replay Clip', defaultDuration: 15 })
    expect(c.activeVenueId).toBe('gym')
    s.close()
  })

  it('keeps venues, mappings, scene overrides, hotkeys and game state', () => {
    const s = new Store(openFixture())
    expect(s.getVenues().map((v) => v.id)).toEqual(['gym', 'field'])
    expect(s.getMappings().find((m) => m.role === 'scoreboard')).toMatchObject({
      template: 'MEDIARY/SCOREBUG',
      dataFormat: 'json',
    })
    expect(s.getSceneOverrides()['CAM 1'].label).toBe('Court Wide')
    expect(s.getSettings().hotkeys['1']).toBe('camera:1')
    expect(s.getGame()).toMatchObject({ homeScore: 42, awayScore: 38, period: 'Q3' })
    s.close()
  })

  it('keeps the per-sport, per-venue checklist including hand-added rows', () => {
    const s = new Store(openFixture())
    const list = s.getChecklist('checklist:basketball:gym')
    expect(list.map((c) => c.label)).toContain('Check the gym scoreboard feed')
    expect(list.find((c) => c.label === 'Check the gym scoreboard feed')?.done).toBe(true)
    s.close()
  })

  it('keeps the log table and remembered window position', () => {
    const s = new Store(openFixture())
    expect(s.recentLogs().length).toBeGreaterThan(0)
    expect(s.getWindowBounds()).toMatchObject({ width: 1600, height: 950 })
    s.close()
  })

  it('actually removes the superseded documents', () => {
    const file = openFixture()
    const before = new DatabaseSync(file).prepare('SELECT key FROM docs').all().map((r) => (r as { key: string }).key)
    expect(before).toEqual(expect.arrayContaining(['cameras', 'checklist']))

    new Store(file).close()

    const after = new DatabaseSync(file).prepare('SELECT key FROM docs').all().map((r) => (r as { key: string }).key)
    expect(after).not.toContain('cameras')
    expect(after).not.toContain('checklist')
    expect(after).toContain('checklist:basketball:gym') // the keyed one survives
  })

  it('is idempotent: reopening runs nothing and changes nothing', () => {
    const file = openFixture()
    new Store(file).close()
    const second = new Store(file)
    expect(second.applied).toEqual([])
    expect(second.schemaVersion()).toBe(2)
    expect(second.getVenues()).toHaveLength(2)
    second.close()
  })

  it('lets the whole application start on it', async () => {
    const hub = new Hub(new Store(openFixture()))
    // demoMode is false in the fixture, so this would reach for real OBS; the
    // point is that construction and shutdown survive real upgraded data.
    expect(hub.state.settings.productionName).toBe('Lincoln High School Broadcasting')
    expect(hub.state.venues).toHaveLength(2)
    expect(hub.state.game.homeScore).toBe(42)
    await hub.shutdown()
  })
})

describe('a database from a newer build', () => {
  it('is refused rather than downgraded', () => {
    const file = openFixture()
    const db = new DatabaseSync(file)
    db.prepare(`UPDATE meta SET value='99' WHERE key='schema_version'`).run()
    db.close()

    expect(() => new Store(file)).toThrow(SchemaTooNewError)
    try {
      new Store(file)
    } catch (e) {
      expect((e as Error).message).toMatch(/newer version/i)
      expect((e as SchemaTooNewError).found).toBe(99)
    }
  })

  it('leaves the newer file untouched when it refuses', () => {
    const file = openFixture()
    let db = new DatabaseSync(file)
    db.prepare(`UPDATE meta SET value='99' WHERE key='schema_version'`).run()
    db.close()

    expect(() => new Store(file)).toThrow()

    db = new DatabaseSync(file)
    const v = (db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get() as { value: string }).value
    const keys = db.prepare('SELECT key FROM docs').all().map((r) => (r as { key: string }).key)
    db.close()
    expect(v).toBe('99')
    expect(keys).toContain('cameras') // migration 2 did not run
  })
})

describe('a brand new database', () => {
  it('is created at the current version with no migrations to apply', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sbc-new-'))
    dirs.push(dir)
    const s = new Store(path.join(dir, 'sbc.db'))
    expect(s.schemaVersion()).toBe(2)
    expect(s.applied).toEqual([])
    s.close()
  })
})

describe('a database from before versioning existed', () => {
  it('is treated as version 0 and migrated, not mistaken for a new file', () => {
    const file = openFixture()
    const db = new DatabaseSync(file)
    db.prepare(`DELETE FROM meta WHERE key='schema_version'`).run()
    db.close()

    const s = new Store(file)
    expect(s.applied).toEqual(['2: drop documents superseded before 1.0.0'])
    expect(s.schemaVersion()).toBe(2)
    expect(s.getVenues()).toHaveLength(2) // data survived
    s.close()
  })
})

describe('the running version is visible', () => {
  it('is carried in application state, so support can ask what a rig is on', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sbc-ver-'))
    dirs.push(dir)
    const hub = new Hub(new Store(path.join(dir, 'sbc.db')), '9.9.9')
    expect(hub.state.version).toBe('9.9.9')
    await hub.shutdown()
  })

  it('defaults to "dev" when running unpackaged rather than claiming a release', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sbc-ver2-'))
    dirs.push(dir)
    const hub = new Hub(new Store(path.join(dir, 'sbc.db')))
    expect(hub.state.version).toBe('dev')
    await hub.shutdown()
  })

  it('main passes the real packaged version', () => {
    const main = readFileSync(path.resolve(import.meta.dirname, '../electron/main.ts'), 'utf8')
    expect(main).toMatch(/new Hub\(store, app\.getVersion\(\)\)/)
  })
})
