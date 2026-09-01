import { EventEmitter } from 'node:events'
import type OBSWebSocket from 'obs-websocket-js'
import { Store } from './db.js'
import { MockObs, ObsWs, type OBSService } from './services/obs.js'
import { CasparGraphics, MockGraphics, type GraphicsController } from './services/graphics.js'
import { ObsReplay } from './services/replay.js'
import { CameraRegistry } from './services/cameras.js'
import { defaultGame } from './db.js'
import { checklistKey } from '../shared/types.js'
import type {
  AppState, BusEvent, Camera, ChecklistItem, GameState, GraphicsRole, LogEntry, LogLevel,
  ObsInput, SceneItem, SceneOverride, Settings, TemplateMapping, Venue,
} from '../shared/types.js'

const MAX_UI_LOGS = 400
/**
 * ponytail: thumbnails are polled scene-by-scene over the OBS WebSocket every
 * two seconds. That is a confidence check ("is CAM 2 pointing at the court"),
 * not a multiview. Put OBS Multiview on a second monitor if you need motion.
 */
const THUMB_MS = 2000
const THUMB_WIDTH = 320
/**
 * Scenes refreshed per tick besides program and preview. Every scene in the
 * collection gets a preview, but a large collection must not turn into a
 * screenshot flood: the rest rotate through this budget.
 */
const THUMB_BUDGET = 4
/**
 * Settings fields save on every keystroke, so a connection setting must not
 * reconnect on every keystroke: typing an IP address would tear OBS and the
 * graphics server down a dozen times. Reconnect once the operator stops typing.
 */
const RECONNECT_DEBOUNCE_MS = 700

/**
 * Build the camera list from what OBS reports. Overrides only rename, hide or
 * annotate a scene - they can never introduce one.
 */
export function deriveCameras(
  scenes: string[],
  overrides: Record<string, SceneOverride>,
  previous: Camera[] = [],
): Camera[] {
  const live = new Map(previous.map((c) => [c.id, c.online]))
  return scenes
    .filter((scene) => !overrides[scene]?.hidden)
    .map((scene) => {
      const o = overrides[scene] ?? {}
      const address = o.address ?? ''
      return {
        id: scene,
        name: o.label || scene,
        type: o.type ?? null,
        address,
        // Nothing to probe means unknown, which is not the same as offline.
        online: address ? (live.get(scene) ?? null) : null,
      }
    })
}

/**
 * Single owner of application state and of every action the UI, the hotkeys and
 * the local control API can perform. Nothing else talks to a service directly,
 * so one failing integration can never take another down.
 */
export class Hub extends EventEmitter {
  state: AppState
  private obs!: OBSService
  private gfx!: GraphicsController
  private replay!: ObsReplay
  private cams!: CameraRegistry
  /** Raw OBS handle, only when the real OBS service is in use. */
  private rawObs: OBSWebSocket | null = null
  /** Scene name -> data URI. Pushed on its own channel so a 1 Hz JPEG never rides in the state snapshot. */
  private thumbs: Record<string, string> = {}
  private thumbTimer: NodeJS.Timeout | null = null
  private thumbsStopped = false
  private thumbCursor = 0
  /** Nobody is looking at a page that shows stills, so do not ask OBS for any. */
  private thumbsWanted = true
  private reloadTimer: NodeJS.Timeout | null = null

  constructor(
    readonly store: Store,
    appVersion = 'dev',
  ) {
    super()
    const settings = store.getSettings()
    this.state = {
      version: appVersion,
      settings,
      obs: { state: 'disconnected', detail: 'Not connected', lastOk: 0, currentScene: '', scenes: [], streaming: false, recording: false, recordPaused: false, replayBufferActive: false, bitrate: 0, droppedFrames: 0, streamDuration: 0, recordDuration: 0, studioMode: false, previewScene: '' },
      graphics: { state: 'disconnected', detail: 'Not connected', lastOk: 0, engine: 'CasparCG Server', version: '', templates: [], onAir: [] },
      replay: { state: 'disconnected', detail: 'Replay buffer off', lastOk: 0, bufferActive: false, playing: false, lastClip: '', duration: settings.replay.defaultDuration, speed: settings.replay.defaultSpeed },
      network: { state: 'connected', detail: 'Local', lastOk: Date.now() },
      cameras: [],
      sceneOverrides: store.getSceneOverrides(),
      inputs: [],
      sceneItems: {},
      inputKinds: [],
      ndiSources: [],
      game: store.getGame(),
      sports: store.getSports(),
      venues: store.getVenues(),
      mappings: store.getMappings(),
      checklist: store.getChecklist(checklistKey(settings.activeSport, settings.activeVenueId), []),
      logs: store.recentLogs(MAX_UI_LOGS),
      alerts: [],
    }
    this.buildServices()
  }

  // ---------------------------------------------------------------- plumbing

  private patch(p: Partial<AppState>) {
    const next = { ...this.state, ...p }
    // Cameras are a view of the OBS scene list, recomputed here rather than
    // stored, so the app can never offer a shot OBS does not have.
    if (p.obs || p.sceneOverrides) next.cameras = deriveCameras(next.obs.scenes, next.sceneOverrides, this.state.cameras)
    this.state = next
    this.emit('state', this.state)
  }

  log(level: LogLevel, scope: string, msg: string) {
    const e: LogEntry = { t: Date.now(), level, scope, msg }
    this.store.addLog(e)
    this.patch({ logs: [...this.state.logs, e].slice(-MAX_UI_LOGS) })
    if (level !== 'info') this.alert(level, msg)
  }

  alert(level: LogLevel, msg: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    this.patch({ alerts: [...this.state.alerts.filter((a) => a.msg !== msg), { id, level, msg }].slice(-5) })
  }
  dismissAlert(id: string) {
    this.patch({ alerts: this.state.alerts.filter((a) => a.id !== id) })
  }

  private event(e: BusEvent) {
    this.emit('event', e)
  }

  /** Wrap an action so a failing integration surfaces as a banner, never a crash. */
  private async guard<T>(scope: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (e) {
      this.log('error', scope, (e as Error).message)
      return undefined
    }
  }

  // ---------------------------------------------------------------- services

  private buildServices() {
    const s = this.state.settings
    const log = (scope: string) => (level: LogLevel, msg: string) => this.log(level, scope, msg)

    if (s.demoMode) {
      const mock = new MockObs({ onStatus: (st) => this.patch({ obs: st }), onEvent: (e) => this.onObsEvent(e), log: log('obs') })
      this.obs = mock
      this.rawObs = null
    } else {
      const real = new ObsWs({
        host: s.obs.host, port: s.obs.port, password: s.obs.password,
        onStatus: (st) => {
          this.patch({ obs: st })
          this.replay?.noteBuffer(st.replayBufferActive)
        },
        onEvent: (e) => this.onObsEvent(e),
        log: log('obs'),
      })
      this.obs = real
      this.rawObs = (real as unknown as { obs: OBSWebSocket }).obs
      this.rawObs.on('MediaInputPlaybackEnded', () => this.replay.notePlaybackEnded())
    }

    this.gfx = s.demoMode
      ? new MockGraphics({ onStatus: (st) => this.patch({ graphics: st }), onEvent: (e) => this.onGfxEvent(e), log: log('graphics') })
      : new CasparGraphics({
          host: s.graphics.host, port: s.graphics.port, channel: s.graphics.channel,
          mappings: () => this.state.mappings,
          onStatus: (st) => this.patch({ graphics: st }),
          onEvent: (e) => this.onGfxEvent(e),
          log: log('graphics'),
        })

    this.replay = new ObsReplay({
      obs: this.obs,
      raw: () => this.rawObs,
      cfg: () => this.state.settings.replay,
      onStatus: (st) => this.patch({ replay: st }),
      onEvent: (e) => this.event(e as BusEvent),
      log: log('replay'),
    })

    this.cams = new CameraRegistry({
      cameras: () => this.state.cameras,
      save: (cam) => {
        // Liveness is runtime state, not configuration; nothing is written to disk.
        this.patch({ cameras: this.state.cameras.map((c) => (c.id === cam.id ? cam : c)) })
      },
      onEvent: (e) => this.event(e),
      onSources: (ndiSources) => this.patch({ ndiSources }),
      log: log('cameras'),
    })
  }

  private onObsEvent(e: { type: string; [k: string]: unknown }) {
    if (e.type === 'obs.inventoryChanged') return void this.refreshInventory()
    this.event(e as unknown as BusEvent)
    if (e.type === 'replay.saved') this.syncChecklist()
    if (e.type === 'obs.streamStarted' || e.type === 'obs.recordingStarted') this.syncChecklist()
  }

  private onGfxEvent(e: { type: string; role?: GraphicsRole }) {
    if (e.type === 'connected') this.event({ type: 'graphics.connected' })
    else if (e.type === 'disconnected') this.event({ type: 'graphics.disconnected' })
    else if (e.type === 'played' && e.role) this.event({ type: 'graphics.played', role: e.role })
    else if (e.type === 'stopped') this.event({ type: 'graphics.stopped', role: e.role ?? null })
    this.syncChecklist()
  }

  /**
   * Which scenes to screenshot this tick. Program and preview every time
   * because they are what the operator is acting on; everything else rotates
   * so the request rate stays flat however many scenes OBS has.
   */
  private thumbScenes(): string[] {
    const s = this.state
    const always = [s.obs.currentScene, s.obs.previewScene].filter(Boolean)
    const rest = s.obs.scenes.filter((n) => !always.includes(n))
    const take: string[] = []
    for (let i = 0; i < Math.min(THUMB_BUDGET, rest.length); i++) take.push(rest[(this.thumbCursor + i) % rest.length])
    if (rest.length) this.thumbCursor = (this.thumbCursor + take.length) % rest.length
    return [...new Set([...always, ...take])]
  }

  private startThumbnails() {
    this.stopThumbnails()
    this.thumbsStopped = false
    const tick = async () => {
      // Screenshots cost OBS work and this process memory. Skip them entirely
      // when the window is hidden or the open page shows no stills; the timer
      // keeps ticking so the picture is current the moment it is needed again.
      if (this.thumbsWanted && this.state.obs.state === 'connected') {
        // Merge: a rotating budget means most scenes keep the still they have.
        const next = { ...this.thumbs }
        for (const scene of this.thumbScenes()) {
          const img = await this.obs.getThumbnail(scene, THUMB_WIDTH).catch(() => '')
          if (img) next[scene] = img
        }
        // Forget scenes OBS no longer has.
        for (const name of Object.keys(next)) if (!this.state.obs.scenes.includes(name)) delete next[name]
        if (this.thumbsStopped) return
        this.thumbs = next
        this.emit('thumbs', next)
      }
      // A capture in flight when we stop must not schedule the next one.
      if (this.thumbsStopped) return
      this.thumbTimer = setTimeout(tick, THUMB_MS)
    }
    this.thumbTimer = setTimeout(tick, 200)
  }
  private stopThumbnails() {
    this.thumbsStopped = true
    if (this.thumbTimer) clearTimeout(this.thumbTimer)
    this.thumbTimer = null
  }
  getThumbnails() {
    return this.thumbs
  }

  /** Driven by the renderer: page visibility plus whether that page shows stills. */
  setThumbnailDemand(wanted: boolean) {
    if (wanted === this.thumbsWanted) return
    this.thumbsWanted = wanted
    if (!wanted && Object.keys(this.thumbs).length) {
      // Drop the cached frames too; holding megabytes of base64 for a page
      // nobody is looking at is the whole problem.
      this.thumbs = {}
      this.emit('thumbs', this.thumbs)
    }
  }

  async startup() {
    this.store.pruneLogs()
    const s = this.state.settings
    this.log('info', 'app', `Starting${s.demoMode ? ' in DEMO MODE (nothing goes to air)' : ''}`)
    this.cams.start({ discovery: s.ndi.discovery, demo: s.demoMode })
    this.loadChecklist()
    if (s.obs.autoConnect || s.demoMode) await this.guard('obs', () => this.obs.connect())
    if (s.graphics.autoConnect || s.demoMode) await this.guard('graphics', () => this.gfx.connect())
    this.startThumbnails()
    await this.refreshInventory()
    this.syncChecklist()
  }

  async shutdown() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = null
    this.stopThumbnails()
    this.cams.stop()
    await this.obs.disconnect().catch(() => {})
    await this.gfx.disconnect().catch(() => {})
    this.store.close()
  }

  /** Rebuild every integration, e.g. after switching demo mode or changing hosts. */
  async reload() {
    this.stopThumbnails()
    this.cams.stop()
    await this.obs.disconnect().catch(() => {})
    await this.gfx.disconnect().catch(() => {})
    this.buildServices()
    await this.startup()
  }

  // ---------------------------------------------------------------- actions

  async takeCamera(id: string) {
    const cam = this.state.cameras.find((c) => c.id === id)
    if (!cam) return this.log('error', 'cameras', `OBS has no scene "${id}"`)
    await this.guard('cameras', async () => {
      // In Studio Mode a click loads preview; the operator then cuts with TAKE.
      if (this.state.obs.studioMode) {
        await this.obs.setPreviewScene(cam.id)
        this.log('info', 'cameras', `PREVIEW ${cam.name}`)
      } else {
        await this.obs.setScene(cam.id)
        this.log('info', 'cameras', `TAKE ${cam.name}`)
      }
    })
  }

  async setPreviewScene(scene: string) {
    // OBS rejects a preview change outside Studio Mode; say so rather than pass it on.
    if (!this.state.obs.studioMode) return this.log('error', 'obs', 'Preview needs Studio Mode. Turn it on from the Production page.')
    await this.guard('obs', () => this.obs.setPreviewScene(scene))
  }

  async transition() {
    if (!this.state.obs.studioMode) return
    await this.guard('obs', async () => {
      const to = this.state.obs.previewScene
      await this.obs.transition()
      this.log('info', 'obs', `TAKE -> ${to}`)
    })
  }

  async setStudioMode(on: boolean) {
    await this.guard('obs', async () => {
      await this.obs.setStudioMode(on)
      this.log('info', 'obs', `Studio Mode ${on ? 'on' : 'off'}`)
    })
  }

  async setScene(scene: string) {
    await this.guard('obs', async () => {
      await this.obs.setScene(scene)
      this.log('info', 'obs', `Scene -> ${scene}`)
    })
  }

  async setStreaming(on: boolean) {
    await this.guard('obs', async () => {
      await (on ? this.obs.startStreaming() : this.obs.stopStreaming())
      this.log('info', 'obs', on ? 'Stream started' : 'Stream stopped')
    })
  }

  async setRecording(on: boolean) {
    await this.guard('obs', async () => {
      await (on ? this.obs.startRecording() : this.obs.stopRecording())
      this.log('info', 'obs', on ? 'Recording started' : 'Recording stopped')
    })
  }

  async pauseRecording(pause: boolean) {
    await this.guard('obs', () => this.obs.pauseRecording(pause))
  }

  async setReplayBuffer(on: boolean) {
    await this.guard('replay', () => (on ? this.replay.start() : this.replay.stop()))
  }
  async saveReplay() {
    await this.guard('replay', () => this.replay.save())
  }
  async replayLast(seconds: number, speed: number) {
    await this.guard('replay', () => this.replay.replayLast(seconds, speed))
  }
  async replayPlay() {
    await this.guard('replay', () => this.replay.play())
  }
  async returnToLive() {
    await this.guard('replay', () => this.replay.returnToLive())
  }

  async graphicsPlay(role: GraphicsRole, data: Record<string, unknown> = {}) {
    await this.guard('graphics', () => this.gfx.play(role, { ...this.roleData(role), ...data }))
  }
  async graphicsUpdate(role: GraphicsRole, data: Record<string, unknown>) {
    await this.guard('graphics', () => this.gfx.update(role, data))
  }
  async graphicsStop(role?: GraphicsRole) {
    await this.guard('graphics', () => this.gfx.stop(role))
  }
  async graphicsClearAll() {
    await this.guard('graphics', () => this.gfx.clearAll())
  }
  async refreshTemplates() {
    await this.guard('graphics', () => this.gfx.getTemplates())
  }
  async connectGraphics(on: boolean) {
    await this.guard('graphics', () => (on ? this.gfx.connect() : this.gfx.disconnect()))
  }
  /** Re-read the inputs, kinds and scene items OBS currently has. */
  async refreshInventory() {
    if (this.state.obs.state !== 'connected') return this.patch({ inputs: [], sceneItems: {}, inputKinds: [] })
    await this.guard('obs', async () => {
      const [inputs, inputKinds] = await Promise.all([this.obs.getInputs(), this.obs.getInputKinds()])
      const sceneItems: Record<string, SceneItem[]> = {}
      for (const scene of this.state.obs.scenes) sceneItems[scene] = await this.obs.getSceneItems(scene).catch(() => [])
      this.patch({ inputs: inputs as ObsInput[], inputKinds, sceneItems })
    })
  }

  async createScene(name: string) {
    await this.guard('obs', async () => {
      await this.obs.createScene(name)
      this.log('info', 'obs', `Scene created: ${name}`)
      await this.refreshInventory()
    })
  }
  async removeScene(name: string) {
    await this.guard('obs', async () => {
      await this.obs.removeScene(name)
      this.saveSceneOverride(name, {}) // drop any annotation for a scene that is gone
      this.log('warn', 'obs', `Scene removed: ${name}`)
      await this.refreshInventory()
    })
  }
  async renameScene(name: string, newName: string) {
    await this.guard('obs', async () => {
      const o = this.state.sceneOverrides[name]
      await this.obs.renameScene(name, newName)
      if (o) {
        this.saveSceneOverride(name, {})
        this.saveSceneOverride(newName, o)
      }
      this.log('info', 'obs', `Scene renamed: ${name} -> ${newName}`)
      await this.refreshInventory()
    })
  }
  async createInput(scene: string, name: string, kind: string, settings?: Record<string, unknown>) {
    await this.guard('obs', async () => {
      await this.obs.createInput(scene, name, kind, settings)
      this.log('info', 'obs', `Source created in ${scene}: ${name} (${kind})`)
      await this.refreshInventory()
    })
  }
  async removeInput(name: string) {
    await this.guard('obs', async () => {
      await this.obs.removeInput(name)
      this.log('warn', 'obs', `Source removed: ${name}`)
      await this.refreshInventory()
    })
  }
  async setSceneItemEnabled(scene: string, id: number, enabled: boolean) {
    await this.guard('obs', async () => {
      await this.obs.setSceneItemEnabled(scene, id, enabled)
      await this.refreshInventory()
    })
  }

  async connectObs(on: boolean) {
    await this.guard('obs', () => (on ? this.obs.connect() : this.obs.disconnect()))
  }

  /** Fields the scoreboard role always carries, derived from live game state. */
  private roleData(role: GraphicsRole): Record<string, unknown> {
    if (role !== 'scoreboard') return {}
    const g = this.state.game
    return {
      home: g.homeTeam.name, homeAbbr: g.homeTeam.abbr, homeColor: g.homeTeam.color, homeScore: g.homeScore,
      away: g.awayTeam.name, awayAbbr: g.awayTeam.abbr, awayColor: g.awayTeam.color, awayScore: g.awayScore,
      period: g.period, clock: g.clock, shotClock: g.shotClock ?? '', possession: g.possession ?? '',
      homeFouls: g.homeFouls, awayFouls: g.awayFouls, homeTimeouts: g.homeTimeouts, awayTimeouts: g.awayTimeouts,
      down: g.down ?? '', distance: g.distance ?? '', ballOn: g.ballOn ?? '',
    }
  }

  async patchGame(p: Partial<GameState>) {
    const game = { ...this.state.game, ...p }
    this.patch({ game })
    this.store.saveGame(game)
    this.event({ type: 'game.updated', game })
    // Push straight to air when the scoreboard is already up.
    if (this.state.graphics.onAir.includes('scoreboard')) await this.graphicsUpdate('scoreboard', this.roleData('scoreboard'))
  }

  /**
   * Start a fresh game: clear the score, take graphics off air and un-tick the
   * pre-game checklist so it gets run again.
   *
   * Deliberately does NOT touch the stream, the recording, the replay buffer or
   * any configuration. Between two games of a double-header the broadcast keeps
   * running, and nobody wants to reconnect OBS to reset a scoreline.
   */
  async startNewGame() {
    const sport = this.state.settings.activeSport
    const profile = this.state.sports.find((s) => s.id === sport)
    const g = defaultGame(sport)
    await this.patchGame({
      ...g,
      // Team names are kept: the operator edits them for the new fixture.
      homeTeam: this.state.game.homeTeam,
      awayTeam: this.state.game.awayTeam,
      period: profile?.periods[0] ?? 'Q1',
      homeTimeouts: profile?.defaultTimeouts ?? 0,
      awayTimeouts: profile?.defaultTimeouts ?? 0,
    })
    // A scoreboard left on air would still be showing the last game.
    if (this.state.graphics.onAir.length) await this.graphicsStop()
    // Auto rows re-derive from live status; only the hand-ticked ones reset.
    this.saveChecklist(this.state.checklist.map((c) => (c.auto ? c : { ...c, done: false })))
    this.syncChecklist()
    this.log('info', 'game', 'New game started')
  }

  async setMute(input: string, muted: boolean) {
    await this.guard('audio', async () => {
      await this.obs.setMute(input, muted)
      this.log('info', 'audio', `${input} ${muted ? 'MUTED' : 'unmuted'}`)
    })
  }
  async getInputs() {
    return (await this.guard('audio', () => this.obs.getInputs())) ?? []
  }

  // --- emergency -------------------------------------------------------
  async safeScene() {
    const venue = this.state.venues.find((v) => v.id === this.state.settings.activeVenueId)
    const target = venue?.safeScene || this.state.obs.scenes[0]
    if (target) await this.setScene(target)
    this.log('warn', 'emergency', `SAFE SCENE -> ${target}`)
  }
  async muteMic() {
    const venue = this.state.venues.find((v) => v.id === this.state.settings.activeVenueId)
    if (venue?.micInput) await this.setMute(venue.micInput, true)
  }

  // --- persistence -----------------------------------------------------
  async saveSettings(next: Settings) {
    const prev = this.state.settings
    this.patch({ settings: next })
    this.store.saveSettings(next)
    const reconnect =
      prev.demoMode !== next.demoMode ||
      JSON.stringify(prev.obs) !== JSON.stringify(next.obs) ||
      JSON.stringify(prev.graphics) !== JSON.stringify(next.graphics) ||
      prev.ndi.discovery !== next.ndi.discovery
    this.log('info', 'settings', 'Settings saved')
    if (JSON.stringify(prev.api) !== JSON.stringify(next.api)) this.emit('api-config')
    if (reconnect) this.scheduleReload()
  }

  private scheduleReload() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null
      void this.reload()
    }, RECONNECT_DEBOUNCE_MS)
  }
  /** Annotate a scene. Passing an empty object clears the annotation. */
  saveSceneOverride(scene: string, o: SceneOverride) {
    const clean = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== false))
    const sceneOverrides = { ...this.state.sceneOverrides }
    if (Object.keys(clean).length) sceneOverrides[scene] = clean as SceneOverride
    else delete sceneOverrides[scene]
    this.patch({ sceneOverrides })
    this.store.saveSceneOverrides(sceneOverrides)
  }
  saveVenues(v: Venue[]) {
    this.patch({ venues: v })
    this.store.saveVenues(v)
  }
  saveMappings(m: TemplateMapping[]) {
    this.patch({ mappings: m })
    this.store.saveMappings(m)
  }
  saveChecklist(c: ChecklistItem[]) {
    this.patch({ checklist: c })
    this.store.saveChecklist(this.checklistKeyNow(), c)
  }

  private checklistKeyNow() {
    return checklistKey(this.state.settings.activeSport, this.state.settings.activeVenueId)
  }

  /**
   * Load the checklist for the current sport and venue, seeding it from the
   * sport profile the first time that combination is used.
   */
  private loadChecklist() {
    const key = this.checklistKeyNow()
    const profile = this.state.sports.find((s) => s.id === this.state.settings.activeSport)
    const seed = (profile?.checklist ?? []).map((label, i) => ({ id: `c${i}`, label, done: false }))
    const items = this.store.hasChecklist(key) ? this.store.getChecklist(key, seed) : seed
    this.patch({ checklist: items })
    if (!this.store.hasChecklist(key)) this.store.saveChecklist(key, items)
    this.applyAutoFlags()
    this.syncChecklist()
  }

  /** Re-attach the live-status bindings after a checklist is loaded or edited. */
  private applyAutoFlags() {
    const auto: Record<string, ChecklistItem['auto']> = {
      'OBS connected': 'obs',
      'Graphics server online': 'graphics',
      'Replay tested': 'replay',
      'Recording enabled': 'record',
      'Stream destination configured': 'stream',
      'All cameras online': 'cameras',
    }
    const next = this.state.checklist.map((c) => {
      const a = auto[c.label]
      return a === c.auto ? c : { ...c, auto: a }
    })
    this.patch({ checklist: next })
  }

  /** Apply a sport preset: scoreboard fields, replay defaults and checklist. */
  async loadSport(sportId: string) {
    const p = this.state.sports.find((s) => s.id === sportId)
    if (!p) return this.log('error', 'sports', `Unknown sport "${sportId}"`)
    const settings: Settings = {
      ...this.state.settings,
      activeSport: sportId,
      replay: { ...this.state.settings.replay, defaultDuration: p.replay.defaultDuration, defaultSpeed: p.replay.defaultSpeed, returnToLive: p.replay.returnToLive },
    }
    this.patch({ settings })
    this.store.saveSettings(settings)
    this.loadChecklist()
    await this.patchGame({ sport: sportId, period: p.periods[0], homeTimeouts: p.defaultTimeouts, awayTimeouts: p.defaultTimeouts })
    this.log('info', 'sports', `Preset loaded: ${p.name}`)
  }

  async loadVenue(venueId: string) {
    const v = this.state.venues.find((x) => x.id === venueId)
    if (!v) return this.log('error', 'venues', `Unknown venue "${venueId}"`)
    await this.saveSettings({
      ...this.state.settings,
      activeVenueId: venueId,
      obs: { ...this.state.settings.obs, host: v.obsHost, port: v.obsPort },
      graphics: { ...this.state.settings.graphics, host: v.graphicsHost, port: v.graphicsPort, channel: v.graphicsChannel },
    })
    this.loadChecklist()
    this.log('info', 'venues', `Venue loaded: ${v.name}`)
  }

  /** Tick the checklist rows that are backed by live status. */
  syncChecklist() {
    const s = this.state
    const value = (auto: NonNullable<ChecklistItem['auto']>): boolean => {
      if (auto === 'obs') return s.obs.state === 'connected'
      if (auto === 'graphics') return s.graphics.state === 'connected'
      if (auto === 'stream') return s.obs.streaming
      if (auto === 'record') return s.obs.recording
      if (auto === 'replay') return s.replay.bufferActive
      // Cameras with no address to probe cannot be proved offline; ignore them.
      const probed = s.cameras.filter((c) => c.online !== null)
      return probed.length > 0 && probed.every((c) => c.online)
    }
    let changed = false
    const next = s.checklist.map((c) => {
      if (!c.auto) return c
      const done = value(c.auto)
      if (done === c.done) return c
      changed = true
      return { ...c, done }
    })
    if (changed) this.saveChecklist(next)
  }

  exportLogs(): string {
    return this.store
      .allLogs()
      .map((l) => `${new Date(l.t).toISOString()} ${l.level.toUpperCase().padEnd(5)} [${l.scope}] ${l.msg}`)
      .join('\n')
  }
}
