import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { GRAPHICS_ROLES, checklistKey } from '../shared/types.js'
import type { ChecklistItem, GameState, LogEntry, Settings, SceneOverride, SportProfile, TemplateMapping, Venue } from '../shared/types.js'
import { DEFAULT_SPORTS } from '../shared/sports.js'

/**
 * ponytail: configuration lives as JSON documents in one `docs` table rather
 * than a normalised schema. The whole dataset is a few dozen rows that are
 * always loaded whole and never queried relationally, so columns would be pure
 * ceremony. Split into real tables if reporting or per-row queries ever appear.
 * `logs` is a real table because it is appended constantly and queried by time.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logs (
  t INTEGER NOT NULL, level TEXT NOT NULL, scope TEXT NOT NULL, msg TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_t ON logs (t);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

/** Bumped whenever a migration is added below. */
const SCHEMA_VERSION = 1

export interface Crypto {
  encrypt(plain: string): string
  decrypt(cipher: string): string
}
/** Marks a value produced by `Crypto.encrypt` so plaintext upgrades cleanly. */
const ENC = 'enc:'

export { defaultChecklist }

export function defaultSettings(): Settings {
  return {
    productionName: 'Sports Broadcasting',
    demoMode: true,
    studentMode: false,
    role: 'admin',
    setupComplete: false,
    obs: { host: '127.0.0.1', port: 4455, password: '', autoConnect: true },
    graphics: { engine: 'casparcg', host: '127.0.0.1', port: 5250, channel: 1, installPath: '', autoConnect: true },
    // Blank on purpose: these must be chosen from what OBS actually has.
    replay: { scene: '', mediaSource: '', defaultDuration: 10, defaultSpeed: 50, returnToLive: true },
    api: { enabled: true, port: 7788, token: randomBytes(16).toString('hex'), allowLan: false },
    ndi: { discovery: true },
    showProgramMonitor: true,
    activeVenueId: 'demo',
    activeSport: 'basketball',
    hotkeys: {
      '1': 'camera:1',
      '2': 'camera:2',
      '3': 'camera:3',
      '4': 'camera:4',
      r: 'replay:last',
      l: 'replay:live',
      s: 'replay:slow',
      F1: 'graphics:scoreboard',
      F2: 'graphics:lowerThird',
      F3: 'graphics:sponsor',
      F4: 'graphics:fullscreen',
      'Ctrl+Shift+R': 'record:toggle',
      'Ctrl+Shift+L': 'stream:start',
      Enter: 'obs:transition',
      Escape: 'graphics:clear',
    },
  }
}

export function defaultGame(sport = 'basketball'): GameState {
  return {
    sport,
    homeTeam: { name: 'Lincoln Lions', abbr: 'LIN', color: '#1f6feb' },
    awayTeam: { name: 'Riverside Rams', abbr: 'RIV', color: '#d13438' },
    homeScore: 0,
    awayScore: 0,
    period: 'Q1',
    clock: '08:00',
    shotClock: '35',
    possession: null,
    homeFouls: 0,
    awayFouls: 0,
    homeTimeouts: 5,
    awayTimeouts: 5,
    down: 1,
    distance: 10,
    ballOn: '50',
  }
}

function defaultVenues(): Venue[] {
  return [
    {
      id: 'demo',
      name: 'Default venue',
      obsHost: '127.0.0.1',
      obsPort: 4455,
      graphicsHost: '127.0.0.1',
      graphicsPort: 5250,
      graphicsChannel: 1,
      safeScene: '',
      micInput: '',
    },
  ]
}

function defaultMappings(): TemplateMapping[] {
  return GRAPHICS_ROLES.map((role) => ({ role, template: '', layer: 20 + GRAPHICS_ROLES.indexOf(role), dataFormat: 'xml' as const, fields: {} }))
}

function defaultChecklist(): ChecklistItem[] {
  const auto: Record<string, ChecklistItem['auto']> = {
    'OBS connected': 'obs',
    'Graphics server online': 'graphics',
    'All cameras online': 'cameras',
    'Replay tested': 'replay',
    'Recording enabled': 'record',
    'Stream destination configured': 'stream',
  }
  return DEFAULT_SPORTS[0].checklist.map((label, i) => ({ id: `c${i}`, label, done: false, auto: auto[label] }))
}

export class Store {
  private db: DatabaseSync
  /** Absent when the OS has no keystore; secrets are then stored as written. */
  private crypto: Crypto | undefined

  constructor(file: string, crypto?: Crypto) {
    this.crypto = crypto
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(SCHEMA)
    this.migrate()
    this.seed()
  }

  private migrate() {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get() as unknown as { value: string } | undefined
    const from = row ? Number(row.value) : 0
    // Future migrations go here, guarded by `if (from < n)`.
    if (from !== SCHEMA_VERSION) {
      this.db.prepare(`INSERT INTO meta (key,value) VALUES ('schema_version',?)
                       ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(SCHEMA_VERSION))
    }
  }

  private seed() {
    if (!this.raw('settings')) this.set('settings', defaultSettings())
    if (!this.raw('venues')) this.set('venues', defaultVenues())
    if (!this.raw('mappings')) this.set('mappings', defaultMappings())
    if (!this.raw(checklistKey('basketball', 'demo'))) this.set(checklistKey('basketball', 'demo'), defaultChecklist())
    if (!this.raw('sports')) this.set('sports', DEFAULT_SPORTS)
    if (!this.raw('game')) this.set('game', defaultGame())
  }

  private raw(key: string): string | undefined {
    return (this.db.prepare('SELECT json FROM docs WHERE key=?').get(key) as unknown as { json: string } | undefined)?.json
  }
  private set<T>(key: string, value: T) {
    this.db.prepare('INSERT INTO docs (key,json) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json').run(key, JSON.stringify(value))
  }
  private get<T>(key: string, fallback: T): T {
    const s = this.raw(key)
    if (!s) return fallback
    try {
      return JSON.parse(s) as T
    } catch {
      return fallback
    }
  }

  // --- secrets ---------------------------------------------------------
  private seal(s: string) {
    if (!s) return ''
    // Without a keystore the value stays plaintext and unprefixed, so a later
    // launch on a machine that does have one reads it correctly and re-seals.
    return this.crypto ? ENC + this.crypto.encrypt(s) : s
  }
  private open(s: string) {
    if (!s) return ''
    if (!s.startsWith(ENC)) return s // written before a keystore was available
    try {
      return this.crypto ? this.crypto.decrypt(s.slice(ENC.length)) : ''
    } catch {
      return ''
    }
  }

  getSettings(): Settings {
    const d = defaultSettings()
    const stored = this.get<Partial<Settings>>('settings', {})
    // Merge one level into each section, so a key added in a later version is
    // filled from the defaults instead of arriving as undefined.
    const s: Settings = {
      ...d,
      ...stored,
      obs: { ...d.obs, ...stored.obs },
      graphics: { ...d.graphics, ...stored.graphics },
      replay: { ...d.replay, ...stored.replay },
      api: { ...d.api, ...stored.api },
      ndi: { ...d.ndi, ...stored.ndi },
      hotkeys: { ...d.hotkeys, ...stored.hotkeys },
    }
    return { ...s, obs: { ...s.obs, password: this.open(s.obs.password) }, api: { ...s.api, token: this.open(s.api.token) } }
  }
  saveSettings(s: Settings) {
    this.set('settings', { ...s, obs: { ...s.obs, password: this.seal(s.obs.password) }, api: { ...s.api, token: this.seal(s.api.token) } })
  }

  getSceneOverrides() { return this.get<Record<string, SceneOverride>>('sceneOverrides', {}) }
  saveSceneOverrides(o: Record<string, SceneOverride>) { this.set('sceneOverrides', o) }
  getVenues() { return this.get<Venue[]>('venues', defaultVenues()) }
  saveVenues(v: Venue[]) { this.set('venues', v) }
  getMappings() { return this.get<TemplateMapping[]>('mappings', defaultMappings()) }
  saveMappings(m: TemplateMapping[]) { this.set('mappings', m) }
  /** Checklists are keyed by sport and venue; missing combinations fall back to the sport's own list. */
  getChecklist(key: string, fallback?: ChecklistItem[]) { return this.get<ChecklistItem[]>(key, fallback ?? defaultChecklist()) }
  hasChecklist(key: string) { return this.raw(key) !== undefined }
  saveChecklist(key: string, c: ChecklistItem[]) { this.set(key, c) }
  getSports() { return this.get<SportProfile[]>('sports', DEFAULT_SPORTS) }
  getGame() { return this.get<GameState>('game', defaultGame()) }
  saveGame(g: GameState) { this.set('game', g) }

  getWindowBounds(): { x: number; y: number; width: number; height: number } | undefined {
    return this.get<{ x: number; y: number; width: number; height: number } | undefined>('windowBounds', undefined)
  }
  saveWindowBounds(b: { x: number; y: number; width: number; height: number }) { this.set('windowBounds', b) }

  // --- logs ------------------------------------------------------------
  addLog(e: LogEntry) {
    this.db.prepare('INSERT INTO logs (t,level,scope,msg) VALUES (?,?,?,?)').run(e.t, e.level, e.scope, e.msg)
  }
  recentLogs(limit = 500): LogEntry[] {
    return (this.db.prepare('SELECT t,level,scope,msg FROM logs ORDER BY t DESC LIMIT ?').all(limit) as unknown as LogEntry[]).reverse()
  }
  allLogs(): LogEntry[] {
    return this.db.prepare('SELECT t,level,scope,msg FROM logs ORDER BY t ASC').all() as unknown as LogEntry[]
  }
  /** Keep the log table from growing without bound across a season. */
  pruneLogs(keepDays = 30) {
    this.db.prepare('DELETE FROM logs WHERE t < ?').run(Date.now() - keepDays * 86400_000)
  }
  close() { this.db.close() }
}
