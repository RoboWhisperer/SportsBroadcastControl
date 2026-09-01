import OBSWebSocket from 'obs-websocket-js'
import type { ObsInput, OBSStatus, SceneItem } from '../../shared/types.js'

export interface OBSService {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getScenes(): Promise<string[]>
  getCurrentScene(): Promise<string>
  setScene(sceneName: string): Promise<void>
  startStreaming(): Promise<void>
  stopStreaming(): Promise<void>
  startRecording(): Promise<void>
  stopRecording(): Promise<void>
  pauseRecording(pause: boolean): Promise<void>
  startReplayBuffer(): Promise<void>
  stopReplayBuffer(): Promise<void>
  saveReplayBuffer(): Promise<string>
  getInputs(): Promise<ObsInput[]>
  setMute(input: string, muted: boolean): Promise<void>
  /** Input kinds this OBS build can create. Only these are ever offered. */
  getInputKinds(): Promise<string[]>
  getSceneItems(sceneName: string): Promise<SceneItem[]>
  setSceneItemEnabled(sceneName: string, itemId: number, enabled: boolean): Promise<void>
  createScene(sceneName: string): Promise<void>
  removeScene(sceneName: string): Promise<void>
  renameScene(sceneName: string, newName: string): Promise<void>
  createInput(sceneName: string, inputName: string, inputKind: string, settings?: Record<string, unknown>): Promise<void>
  removeInput(inputName: string): Promise<void>
  setStudioMode(on: boolean): Promise<void>
  setPreviewScene(sceneName: string): Promise<void>
  /** Studio Mode: cut preview to program. */
  transition(): Promise<void>
  /** Base64 data URI for a scene, or '' when OBS cannot render one. */
  getThumbnail(sceneName: string, width: number): Promise<string>
  getStatus(): OBSStatus
}

export interface OBSDeps {
  host: string
  port: number
  password: string
  onStatus: (s: OBSStatus) => void
  onEvent: (e: { type: string; [k: string]: unknown }) => void
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
}

const RECONNECT_MS = [1000, 2000, 4000, 8000, 15000]
const POLL_MS = 1000

/** GetSceneItemList entry, as OBS 30 / obs-websocket 5 sends it. */
export interface RawSceneItem {
  sceneItemId: number
  sourceName: string
  sceneItemEnabled: boolean
  sourceType?: string
  inputKind?: string | null
  isGroup?: boolean | null
}

/**
 * Classify one scene entry. OBS lets a scene contain another scene, and a group
 * stands in for several sources, so `sourceName` alone cannot tell an operator
 * what is actually in the scene.
 */
export function mapSceneItem(i: RawSceneItem, group?: string): SceneItem {
  return {
    id: i.sceneItemId,
    sourceName: i.sourceName,
    enabled: i.sceneItemEnabled,
    type: i.isGroup ? 'group' : i.sourceType === 'OBS_SOURCE_TYPE_SCENE' ? 'scene' : 'input',
    kind: i.inputKind ?? '',
    ...(group ? { group } : {}),
  }
}

const EMPTY: OBSStatus = {
  state: 'disconnected',
  detail: 'Not connected',
  lastOk: 0,
  currentScene: '',
  scenes: [],
  streaming: false,
  recording: false,
  recordPaused: false,
  replayBufferActive: false,
  bitrate: 0,
  droppedFrames: 0,
  streamDuration: 0,
  recordDuration: 0,
  studioMode: false,
  previewScene: '',
}

export class ObsWs implements OBSService {
  private obs = new OBSWebSocket()
  private status: OBSStatus = { ...EMPTY }
  private attempt = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private wantConnection = false
  private lastBytes = 0
  private lastBytesAt = 0

  constructor(private deps: OBSDeps) {
    this.obs.on('ConnectionClosed', () => {
      if (this.status.state === 'disconnected') return
      this.set({ ...EMPTY, state: 'error', detail: 'OBS disconnected' })
      this.deps.log('warn', 'OBS disconnected')
      this.stopPolling()
      this.scheduleReconnect()
    })
    this.obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
      this.set({ currentScene: sceneName })
      this.deps.onEvent({ type: 'obs.sceneChanged', scene: sceneName })
    })
    this.obs.on('StreamStateChanged', ({ outputActive }) => {
      this.set({ streaming: outputActive })
      this.deps.onEvent({ type: outputActive ? 'obs.streamStarted' : 'obs.streamStopped' })
    })
    this.obs.on('RecordStateChanged', ({ outputActive }) => {
      this.set({ recording: outputActive })
      this.deps.onEvent({ type: outputActive ? 'obs.recordingStarted' : 'obs.recordingStopped' })
    })
    this.obs.on('CurrentPreviewSceneChanged', ({ sceneName }) => {
      this.set({ previewScene: sceneName })
      this.deps.onEvent({ type: 'obs.previewChanged', scene: sceneName })
    })
    this.obs.on('StudioModeStateChanged', ({ studioModeEnabled }) =>
      this.set({ studioMode: studioModeEnabled, previewScene: studioModeEnabled ? this.status.previewScene : '' }),
    )
    // OBS is the source of truth: re-read whenever it says the list changed.
    for (const ev of ['SceneListChanged', 'SceneCreated', 'SceneRemoved', 'SceneNameChanged'] as const) {
      this.obs.on(ev, () => void this.refresh().catch(() => {}))
    }
    for (const ev of ['InputCreated', 'InputRemoved', 'InputNameChanged', 'SceneItemCreated', 'SceneItemRemoved', 'SceneItemEnableStateChanged'] as const) {
      this.obs.on(ev, () => this.deps.onEvent({ type: 'obs.inventoryChanged' }))
    }
    this.obs.on('ReplayBufferStateChanged', ({ outputActive }) => this.set({ replayBufferActive: outputActive }))
    this.obs.on('ReplayBufferSaved', ({ savedReplayPath }) => {
      this.deps.log('info', `Replay saved: ${savedReplayPath}`)
      this.deps.onEvent({ type: 'replay.saved', clip: savedReplayPath })
    })
  }

  getStatus() {
    return this.status
  }
  private set(p: Partial<OBSStatus>) {
    this.status = { ...this.status, ...p }
    this.deps.onStatus(this.status)
  }

  async connect(): Promise<void> {
    this.wantConnection = true
    this.attempt = 0
    await this.dial()
  }

  private async dial(): Promise<void> {
    if (!this.wantConnection) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.set({ state: 'connecting', detail: `Connecting to ${this.deps.host}:${this.deps.port}` })
    try {
      await this.obs.connect(`ws://${this.deps.host}:${this.deps.port}`, this.deps.password || undefined, {
        rpcVersion: 1,
      })
      const { obsVersion } = await this.obs.call('GetVersion')
      this.set({ state: 'connected', detail: `OBS ${obsVersion}`, lastOk: Date.now() })
      this.deps.log('info', `OBS connected (${obsVersion})`)
      this.attempt = 0
      await this.refresh()
      this.startPolling()
    } catch (e) {
      this.set({ state: 'error', detail: (e as Error).message })
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (!this.wantConnection) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    const wait = RECONNECT_MS[Math.min(this.attempt++, RECONNECT_MS.length - 1)]
    this.set({ detail: `Reconnecting in ${wait / 1000}s...` })
    this.reconnectTimer = setTimeout(() => void this.dial(), wait)
  }

  private startPolling() {
    this.stopPolling()
    this.pollTimer = setInterval(() => void this.poll(), POLL_MS)
  }
  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  private async refresh() {
    const list = await this.obs.call('GetSceneList')
    const { studioModeEnabled } = await this.obs.call('GetStudioModeEnabled').catch(() => ({ studioModeEnabled: false }))
    const preview = studioModeEnabled
      ? await this.obs.call('GetCurrentPreviewScene').then((r) => r.currentPreviewSceneName).catch(() => '')
      : ''
    this.set({
      currentScene: list.currentProgramSceneName,
      // OBS returns scenes in reverse UI order.
      scenes: (list.scenes as { sceneName: string }[]).map((s) => s.sceneName).reverse(),
      studioMode: studioModeEnabled,
      previewScene: preview,
    })
  }

  private async poll() {
    if (this.status.state !== 'connected') return
    try {
      const [stream, record, replay] = await Promise.all([
        this.obs.call('GetStreamStatus'),
        this.obs.call('GetRecordStatus'),
        this.obs.call('GetReplayBufferStatus').catch(() => ({ outputActive: false })),
      ])
      const now = Date.now()
      let bitrate = 0
      if (stream.outputActive && this.lastBytesAt) {
        const dt = (now - this.lastBytesAt) / 1000
        if (dt > 0) bitrate = Math.max(0, ((stream.outputBytes - this.lastBytes) * 8) / 1000 / dt)
      }
      this.lastBytes = stream.outputBytes
      this.lastBytesAt = now
      this.set({
        streaming: stream.outputActive,
        streamDuration: Math.round(stream.outputDuration / 1000),
        droppedFrames: stream.outputTotalFrames ? stream.outputSkippedFrames / stream.outputTotalFrames : 0,
        bitrate: this.status.streaming || stream.outputActive ? Math.round(bitrate) : 0,
        recording: record.outputActive,
        recordPaused: record.outputPaused,
        recordDuration: Math.round(record.outputDuration / 1000),
        replayBufferActive: replay.outputActive,
        lastOk: now,
      })
    } catch (e) {
      this.deps.log('warn', `OBS poll failed: ${(e as Error).message}`)
    }
  }

  async disconnect() {
    this.wantConnection = false
    this.stopPolling()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    await this.obs.disconnect().catch(() => {})
    this.set({ ...EMPTY })
  }

  async getScenes() {
    await this.refresh()
    return this.status.scenes
  }
  async getCurrentScene() {
    return (await this.obs.call('GetSceneList')).currentProgramSceneName
  }
  async setScene(sceneName: string) {
    await this.obs.call('SetCurrentProgramScene', { sceneName })
    this.set({ currentScene: sceneName })
  }
  async startStreaming() {
    await this.obs.call('StartStream')
  }
  async stopStreaming() {
    await this.obs.call('StopStream')
  }
  async startRecording() {
    await this.obs.call('StartRecord')
  }
  async stopRecording() {
    await this.obs.call('StopRecord')
  }
  async pauseRecording(pause: boolean) {
    await this.obs.call(pause ? 'PauseRecord' : 'ResumeRecord')
  }
  async startReplayBuffer() {
    await this.obs.call('StartReplayBuffer')
  }
  async stopReplayBuffer() {
    await this.obs.call('StopReplayBuffer')
  }
  async saveReplayBuffer() {
    await this.obs.call('SaveReplayBuffer')
    // OBS writes the file asynchronously; the path arrives on ReplayBufferSaved.
    const { savedReplayPath } = await this.obs.call('GetLastReplayBufferReplay').catch(() => ({ savedReplayPath: '' }))
    return savedReplayPath
  }
  async getInputs(): Promise<ObsInput[]> {
    const { inputs } = await this.obs.call('GetInputList')
    return Promise.all(
      (inputs as { inputName: string; inputKind: string }[]).map(async (i) => ({
        name: i.inputName,
        kind: i.inputKind,
        // Inputs with no audio track reject this; that is not "unmuted".
        muted: await this.obs
          .call('GetInputMute', { inputName: i.inputName })
          .then((r) => r.inputMuted as boolean | null)
          .catch(() => null),
      })),
    )
  }
  async getInputKinds() {
    const { inputKinds } = await this.obs.call('GetInputKindList')
    return inputKinds as string[]
  }
  async getSceneItems(sceneName: string): Promise<SceneItem[]> {
    const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName })
    const out: SceneItem[] = []
    for (const raw of sceneItems as unknown as RawSceneItem[]) {
      const item = mapSceneItem(raw)
      out.push(item)
      // A group hides its contents behind one entry; expand it so the operator
      // sees the sources that are actually in the scene.
      if (item.type === 'group') {
        const inner = await this.obs
          .call('GetGroupSceneItemList', { sceneName: raw.sourceName })
          .then((r) => r.sceneItems as unknown as RawSceneItem[])
          .catch(() => [])
        for (const child of inner) out.push(mapSceneItem(child, raw.sourceName))
      }
    }
    return out
  }
  async setSceneItemEnabled(sceneName: string, sceneItemId: number, sceneItemEnabled: boolean) {
    await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled })
  }
  async createScene(sceneName: string) {
    await this.obs.call('CreateScene', { sceneName })
    await this.refresh()
  }
  async removeScene(sceneName: string) {
    await this.obs.call('RemoveScene', { sceneName })
    await this.refresh()
  }
  async renameScene(sceneName: string, newSceneName: string) {
    await this.obs.call('SetSceneName', { sceneName, newSceneName })
    await this.refresh()
  }
  async createInput(sceneName: string, inputName: string, inputKind: string, inputSettings: Record<string, unknown> = {}) {
    await this.obs.call('CreateInput', { sceneName, inputName, inputKind, inputSettings: inputSettings as never, sceneItemEnabled: true })
  }
  async removeInput(inputName: string) {
    await this.obs.call('RemoveInput', { inputName })
  }
  async setMute(inputName: string, inputMuted: boolean) {
    await this.obs.call('SetInputMute', { inputName, inputMuted })
  }
  async setStudioMode(studioModeEnabled: boolean) {
    await this.obs.call('SetStudioModeEnabled', { studioModeEnabled })
    this.set({ studioMode: studioModeEnabled })
    if (studioModeEnabled) await this.refresh()
  }
  async setPreviewScene(sceneName: string) {
    await this.obs.call('SetCurrentPreviewScene', { sceneName })
    this.set({ previewScene: sceneName })
  }
  async transition() {
    await this.obs.call('TriggerStudioModeTransition')
  }
  async getThumbnail(sourceName: string, imageWidth: number) {
    const r = await this.obs
      .call('GetSourceScreenshot', { sourceName, imageFormat: 'jpg', imageWidth, imageCompressionQuality: 40 })
      .catch(() => null)
    return r?.imageData ?? ''
  }
}

/** Demo provider so the app is fully usable with no OBS running. */
export class MockObs implements OBSService {
  private status: OBSStatus = { ...EMPTY }
  private timer: NodeJS.Timeout | null = null
  /** The mock's own inventory. Demo mode shows this because the mock OBS has it. */
  private inputs: ObsInput[] = [
    { name: 'Announcer Mic', kind: 'pulse_input_capture', muted: false },
    { name: 'Crowd Mic', kind: 'pulse_input_capture', muted: false },
    { name: 'Music Bed', kind: 'ffmpeg_source', muted: true },
  ]
  private items: Record<string, SceneItem[]> = {}
  private nextItemId = 1
  constructor(private deps: Pick<OBSDeps, 'onStatus' | 'onEvent' | 'log'>) {
    const scenes = ['CAM 1', 'CAM 2', 'CAM 3', 'CAM 4', 'REPLAY', 'PROGRAM', 'SAFE / SLATE']
    this.status = { ...EMPTY, scenes, currentScene: scenes[0] }
    // Every scene item below refers to an input this mock actually has, or to
    // another of its scenes - the same shapes a real OBS reports.
    for (const n of [1, 2, 3, 4]) {
      this.inputs.push({ name: `Camera ${n}`, kind: 'v4l2_input', muted: null })
      this.items[`CAM ${n}`] = [{ id: this.nextItemId++, sourceName: `Camera ${n}`, enabled: true, type: 'input', kind: 'v4l2_input' }]
    }
    this.inputs.push({ name: 'Replay Clip', kind: 'ffmpeg_source', muted: false })
    this.inputs.push({ name: 'Slate', kind: 'image_source', muted: null })
    this.items['REPLAY'] = [{ id: this.nextItemId++, sourceName: 'Replay Clip', enabled: true, type: 'input', kind: 'ffmpeg_source' }]
    this.items['SAFE / SLATE'] = [{ id: this.nextItemId++, sourceName: 'Slate', enabled: true, type: 'input', kind: 'image_source' }]
    // A scene nested inside another scene, which OBS reports as a scene item.
    this.items['PROGRAM'] = [
      { id: this.nextItemId++, sourceName: 'CAM 1', enabled: true, type: 'scene', kind: '' },
      { id: this.nextItemId++, sourceName: 'Slate', enabled: false, type: 'input', kind: 'image_source' },
    ]
  }
  private set(p: Partial<OBSStatus>) {
    this.status = { ...this.status, ...p }
    this.deps.onStatus(this.status)
  }
  getStatus() {
    return this.status
  }
  async connect() {
    this.set({ state: 'connected', detail: 'Mock OBS (Demo)', lastOk: Date.now() })
    this.timer = setInterval(() => {
      if (this.status.streaming) {
        this.set({
          streamDuration: this.status.streamDuration + 1,
          bitrate: 6000 + Math.round(Math.sin(Date.now() / 5000) * 300),
          droppedFrames: 0,
          lastOk: Date.now(),
        })
      }
      if (this.status.recording && !this.status.recordPaused) this.set({ recordDuration: this.status.recordDuration + 1 })
    }, 1000)
  }
  async disconnect() {
    if (this.timer) clearInterval(this.timer)
    this.set({ ...EMPTY })
  }
  async getScenes() {
    return this.status.scenes
  }
  async getCurrentScene() {
    return this.status.currentScene
  }
  async setScene(sceneName: string) {
    this.set({ currentScene: sceneName })
    this.deps.onEvent({ type: 'obs.sceneChanged', scene: sceneName })
  }
  async startStreaming() {
    this.set({ streaming: true, streamDuration: 0 })
    this.deps.onEvent({ type: 'obs.streamStarted' })
  }
  async stopStreaming() {
    this.set({ streaming: false, bitrate: 0 })
    this.deps.onEvent({ type: 'obs.streamStopped' })
  }
  async startRecording() {
    this.set({ recording: true, recordDuration: 0 })
    this.deps.onEvent({ type: 'obs.recordingStarted' })
  }
  async stopRecording() {
    this.set({ recording: false, recordPaused: false })
    this.deps.onEvent({ type: 'obs.recordingStopped' })
  }
  async pauseRecording(pause: boolean) {
    this.set({ recordPaused: pause })
  }
  async startReplayBuffer() {
    this.set({ replayBufferActive: true })
  }
  async stopReplayBuffer() {
    this.set({ replayBufferActive: false })
  }
  async saveReplayBuffer() {
    const clip = `demo-replay-${new Date().toISOString().replace(/[:.]/g, '-')}.mkv`
    this.deps.onEvent({ type: 'replay.saved', clip })
    return clip
  }
  async getInputs() {
    return this.inputs
  }
  async setMute(name: string, muted: boolean) {
    const i = this.inputs.find((x) => x.name === name)
    if (i) i.muted = muted
  }
  async getInputKinds() {
    return ['ffmpeg_source', 'image_source', 'browser_source', 'color_source_v3', 'text_ft2_source_v2', 'pulse_input_capture']
  }
  async getSceneItems(sceneName: string) {
    return this.items[sceneName] ?? []
  }
  async setSceneItemEnabled(sceneName: string, id: number, enabled: boolean) {
    const it = this.items[sceneName]?.find((x) => x.id === id)
    if (it) it.enabled = enabled
  }
  async createScene(sceneName: string) {
    if (this.status.scenes.includes(sceneName)) throw new Error(`Scene "${sceneName}" already exists`)
    this.items[sceneName] = []
    this.set({ scenes: [...this.status.scenes, sceneName], currentScene: this.status.currentScene || sceneName })
  }
  async removeScene(sceneName: string) {
    delete this.items[sceneName]
    const scenes = this.status.scenes.filter((x) => x !== sceneName)
    this.set({
      scenes,
      currentScene: this.status.currentScene === sceneName ? (scenes[0] ?? '') : this.status.currentScene,
      previewScene: this.status.previewScene === sceneName ? '' : this.status.previewScene,
    })
  }
  async renameScene(sceneName: string, newName: string) {
    this.items[newName] = this.items[sceneName] ?? []
    delete this.items[sceneName]
    this.set({
      scenes: this.status.scenes.map((x) => (x === sceneName ? newName : x)),
      currentScene: this.status.currentScene === sceneName ? newName : this.status.currentScene,
    })
  }
  async createInput(sceneName: string, inputName: string, inputKind: string) {
    if (this.inputs.some((i) => i.name === inputName)) throw new Error(`Input "${inputName}" already exists`)
    this.inputs.push({ name: inputName, kind: inputKind, muted: inputKind.includes('capture') ? false : null })
    ;(this.items[sceneName] ??= []).push({ id: this.nextItemId++, sourceName: inputName, enabled: true, type: 'input', kind: inputKind })
  }
  async removeInput(inputName: string) {
    this.inputs = this.inputs.filter((i) => i.name !== inputName)
    for (const k of Object.keys(this.items)) this.items[k] = this.items[k].filter((i) => i.sourceName !== inputName)
  }
  async setStudioMode(on: boolean) {
    this.set({ studioMode: on, previewScene: on ? this.status.scenes.find((x) => x !== this.status.currentScene) ?? '' : '' })
  }
  async setPreviewScene(sceneName: string) {
    if (!this.status.studioMode) throw new Error('Studio Mode is not enabled')
    this.set({ previewScene: sceneName })
    this.deps.onEvent({ type: 'obs.previewChanged', scene: sceneName })
  }
  async transition() {
    if (!this.status.previewScene) return
    const next = this.status.previewScene
    this.set({ previewScene: this.status.currentScene })
    await this.setScene(next)
  }
  /** A labelled colour card, so the thumbnail feature is visible without OBS. */
  async getThumbnail(sceneName: string) {
    const hue = [...sceneName].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">` +
      `<rect width="320" height="180" fill="hsl(${hue} 35% 22%)"/>` +
      `<text x="160" y="98" fill="hsl(${hue} 60% 78%)" font-family="monospace" font-size="22" text-anchor="middle">` +
      sceneName.replace(/[<>&]/g, '') +
      `</text></svg>`
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  }
}
