/**
 * Regenerates tests/fixtures/v1.0.1-schema1.db — a configuration database in
 * the shape shipped by 1.0.0 and 1.0.1 (schema version 1).
 *
 * Written by hand rather than copied from a real installation so it contains no
 * secrets, and so it can be regenerated if it is ever lost. It deliberately
 * also carries `cameras` and `checklist`, the two documents that pre-release
 * builds wrote and that migration 2 removes, so opening it exercises a real
 * migration rather than a no-op.
 *
 *   ELECTRON_RUN_AS_NODE=1 npx electron tests/fixtures/make-v1-fixture.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'v1.0.1-schema1.db')
for (const suffix of ['', '-wal', '-shm']) rmSync(out + suffix, { force: true })

const db = new DatabaseSync(out)
db.exec(`
  CREATE TABLE docs (key TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE logs (t INTEGER NOT NULL, level TEXT NOT NULL, scope TEXT NOT NULL, msg TEXT NOT NULL);
  CREATE INDEX logs_t ON logs (t);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`)

const put = (key, value) => db.prepare('INSERT INTO docs (key,json) VALUES (?,?)').run(key, JSON.stringify(value))

put('settings', {
  productionName: 'Lincoln High School Broadcasting',
  demoMode: false,
  studentMode: false,
  role: 'admin',
  setupComplete: true,
  obs: { host: '192.168.1.20', port: 4455, password: '', autoConnect: true },
  graphics: { engine: 'casparcg', host: '192.168.1.21', port: 5250, channel: 1, installPath: '/opt/casparcg', autoConnect: true },
  replay: { scene: 'REPLAY', mediaSource: 'Replay Clip', defaultDuration: 15, defaultSpeed: 25, returnToLive: true },
  api: { enabled: true, port: 7788, token: 'fixture-token-not-a-secret', allowLan: false },
  ndi: { discovery: true },
  showProgramMonitor: true,
  activeVenueId: 'gym',
  activeSport: 'basketball',
  hotkeys: { '1': 'camera:1', '2': 'camera:2', r: 'replay:last', l: 'replay:live', Enter: 'obs:transition' },
})
put('venues', [
  { id: 'gym', name: 'Lincoln High School Gym', obsHost: '192.168.1.20', obsPort: 4455, graphicsHost: '192.168.1.21', graphicsPort: 5250, graphicsChannel: 1, safeScene: 'SAFE', micInput: 'Announcer Mic' },
  { id: 'field', name: 'Lincoln High School Field', obsHost: '192.168.1.30', obsPort: 4455, graphicsHost: '192.168.1.31', graphicsPort: 5250, graphicsChannel: 1, safeScene: 'SLATE', micInput: 'Field Mic' },
])
put('mappings', [
  { role: 'scoreboard', template: 'MEDIARY/SCOREBUG', layer: 20, dataFormat: 'json', fields: { homeAbbr: 'team1', homeScore: 'score1' } },
  { role: 'lowerThird', template: 'MEDIARY/LOWERTHIRD', layer: 21, dataFormat: 'json', fields: { line1: 'name', line2: 'title' } },
])
put('sceneOverrides', { 'CAM 1': { label: 'Court Wide', address: '192.168.1.11:554', type: 'RTSP' }, INTERVIEW: { hidden: true } })
put('game', {
  sport: 'basketball', homeTeam: { name: 'Lincoln Lions', abbr: 'LIN', color: '#1f6feb' },
  awayTeam: { name: 'Riverside Rams', abbr: 'RIV', color: '#d13438' },
  homeScore: 42, awayScore: 38, period: 'Q3', clock: '04:32', shotClock: '18',
  possession: 'home', homeFouls: 3, awayFouls: 5, homeTimeouts: 2, awayTimeouts: 4,
})
put('checklist:basketball:gym', [
  { id: 'c0', label: 'Production PC connected', done: true },
  { id: 'c1', label: 'OBS connected', done: true, auto: 'obs' },
  { id: 'u1', label: 'Check the gym scoreboard feed', done: true },
])
put('sports', [{ id: 'basketball', name: 'Basketball', fields: ['homeScore'], periods: ['Q1'], periodLabel: 'Quarter', clockCountsDown: true, defaultTimeouts: 5, graphics: ['scoreboard'], replay: { durations: [5, 10, 15], defaultDuration: 10, defaultSpeed: 50, returnToLive: true }, checklist: ['OBS connected'] }])
put('windowBounds', { x: 100, y: 60, width: 1600, height: 950 })

// Superseded documents that migration 2 removes.
put('cameras', [{ id: '1', name: 'CAM 1', type: 'NDI', obsScene: 'CAM 1', source: 'STUDIO (Wide)', online: false }])
put('checklist', [{ id: 'c0', label: 'Old global checklist row', done: false }])

db.prepare('INSERT INTO logs (t,level,scope,msg) VALUES (?,?,?,?)').run(1756000000000, 'info', 'app', 'Starting')
db.prepare(`INSERT INTO meta (key,value) VALUES ('schema_version','1')`).run()
db.close()
console.log('wrote', out)
