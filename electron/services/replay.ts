import type OBSWebSocket from 'obs-websocket-js'
import type { ReplayStatus, Settings } from '../../shared/types.js'
import type { OBSService } from './obs.js'

export interface ReplayProvider {
  start(): Promise<void>
  stop(): Promise<void>
  save(): Promise<string>
  /** Save the buffer and roll the last `seconds` on air at `speed` percent. */
  replayLast(seconds: number, speed: number): Promise<void>
  play(): Promise<void>
  returnToLive(): Promise<void>
  getStatus(): ReplayStatus
}

export interface ReplayDeps {
  obs: OBSService
  /** Raw obs-websocket handle for media-source calls; null in demo mode. */
  raw: () => OBSWebSocket | null
  cfg: () => Settings['replay']
  onStatus: (s: ReplayStatus) => void
  onEvent: (e: { type: string; [k: string]: unknown }) => void
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
}

/**
 * Replay on top of the OBS Replay Buffer.
 *
 * OBS owns the buffer length (Settings > Output > Replay Buffer). Saving writes
 * the whole buffer to disk, so "last N seconds" is implemented by loading the
 * clip into a media source and seeking to `clipDuration - N`. Slow motion uses
 * the ffmpeg source's `speed_percent`, which is the only speed control OBS
 * exposes over the WebSocket.
 */
export class ObsReplay implements ReplayProvider {
  private status: ReplayStatus = {
    state: 'disconnected',
    detail: 'Replay buffer off',
    lastOk: 0,
    bufferActive: false,
    playing: false,
    lastClip: '',
    duration: 10,
    speed: 100,
  }
  private liveScene = ''

  constructor(private deps: ReplayDeps) {}

  getStatus() {
    return this.status
  }
  private set(p: Partial<ReplayStatus>) {
    this.status = { ...this.status, ...p }
    this.deps.onStatus(this.status)
  }
  /** Called by the OBS layer when the buffer state or a save lands. */
  noteBuffer(active: boolean) {
    this.set({ bufferActive: active, state: active ? 'connected' : 'disconnected', detail: active ? 'Buffer active' : 'Replay buffer off' })
  }
  notePlaybackEnded() {
    if (!this.status.playing) return
    this.set({ playing: false })
    if (this.deps.cfg().returnToLive) void this.returnToLive()
  }

  async start() {
    await this.deps.obs.startReplayBuffer()
    this.noteBuffer(true)
    this.deps.log('info', 'Replay buffer started')
  }
  async stop() {
    await this.deps.obs.stopReplayBuffer()
    this.noteBuffer(false)
  }

  async save(): Promise<string> {
    if (!this.status.bufferActive) throw new Error('Replay buffer is not running. Press START BUFFER first.')
    const clip = await this.deps.obs.saveReplayBuffer()
    this.set({ lastClip: clip, lastOk: Date.now() })
    this.deps.log('info', `Replay clip saved: ${clip || '(path pending)'}`)
    this.deps.onEvent({ type: 'replay.saved', clip })
    return clip
  }

  async replayLast(seconds: number, speed: number) {
    const cfg = this.deps.cfg()
    const clip = await this.save()
    this.set({ duration: seconds, speed })
    const raw = this.deps.raw()
    if (!raw) {
      // Demo mode: no media source to drive, just show the replay scene.
      await this.deps.obs.setScene(cfg.scene)
      this.set({ playing: true })
      return
    }
    if (!cfg.scene || !cfg.mediaSource) {
      throw new Error('Replay scene / media source not configured. Open Settings > Replay.')
    }
    if (!clip) throw new Error('OBS did not report a saved clip path yet. Try again in a moment.')

    this.liveScene = this.deps.obs.getStatus().currentScene
    await raw.call('SetInputSettings', {
      inputName: cfg.mediaSource,
      inputSettings: { local_file: clip, speed_percent: speed, looping: false, restart_on_activate: true, close_when_inactive: false },
      overlay: true,
    })
    await this.deps.obs.setScene(cfg.scene)
    await raw.call('TriggerMediaInputAction', {
      inputName: cfg.mediaSource,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    })
    // Seek so playback starts `seconds` before the end of the buffered clip.
    const st = await raw.call('GetMediaInputStatus', { inputName: cfg.mediaSource }).catch(() => null)
    const total = st?.mediaDuration ?? 0
    const cursor = Math.max(0, total - seconds * 1000)
    if (total > 0 && cursor > 0) {
      await raw.call('SetMediaInputCursor', { inputName: cfg.mediaSource, mediaCursor: cursor }).catch(() => {})
    }
    this.set({ playing: true, lastOk: Date.now() })
    this.deps.log('info', `Replay: last ${seconds}s at ${speed}%`)
  }

  async play() {
    const raw = this.deps.raw()
    const cfg = this.deps.cfg()
    if (raw && cfg.mediaSource) {
      await raw.call('TriggerMediaInputAction', {
        inputName: cfg.mediaSource,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      })
    }
    if (cfg.scene) await this.deps.obs.setScene(cfg.scene)
    this.set({ playing: true })
  }

  async returnToLive() {
    const target = this.liveScene || this.deps.obs.getStatus().scenes[0]
    if (target) await this.deps.obs.setScene(target)
    this.set({ playing: false })
    this.deps.log('info', `Return to live: ${target}`)
  }
}
