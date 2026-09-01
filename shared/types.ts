/** Types shared by the Electron main process, the React renderer and the local control API. */

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ServiceStatus {
  state: ConnState
  /** Human-readable detail shown in the status bar / monitoring page. */
  detail: string
  /** Epoch ms of the last successful contact, 0 if never. */
  lastOk: number
}

// ---------------------------------------------------------------- OBS

export interface OBSStatus extends ServiceStatus {
  currentScene: string
  scenes: string[]
  streaming: boolean
  recording: boolean
  recordPaused: boolean
  replayBufferActive: boolean
  /** kbit/s, 0 when not streaming. */
  bitrate: number
  /** 0..1 */
  droppedFrames: number
  /** Seconds of the active stream. */
  streamDuration: number
  recordDuration: number
  /** OBS Studio Mode: when on, a take goes to preview first. */
  studioMode: boolean
  previewScene: string
}

// ---------------------------------------------------------------- Cameras

export type CameraType = 'NDI' | 'HDMI_ENCODER' | 'PTZ' | 'RTSP' | 'SRT' | 'CUSTOM'


/**
 * Per-scene annotation. Purely an overlay on what OBS reports: a scene OBS does
 * not have cannot be annotated into existence, and deleting every override
 * changes nothing about which shots the app offers.
 */
export interface SceneOverride {
  /** Friendlier label for the tile. The OBS scene name stays authoritative. */
  label?: string
  /** Keep this scene off the Production camera row (still switchable elsewhere). */
  hidden?: boolean
  /** Only for the reachability probe; OBS owns the actual source. */
  type?: CameraType
  address?: string
}

/**
 * A shot on the Production page. Derived from the OBS scene list on every
 * update and never stored, so the app can only show what OBS has.
 */
export interface Camera {
  /** The OBS scene name, which is also the identity. */
  id: string
  name: string
  type: CameraType | null
  address: string
  /** null when there is nothing to probe - absence of proof, not offline. */
  online: boolean | null
}

/** An OBS input, as OBS reports it. */
export interface ObsInput {
  name: string
  kind: string
  /** null for inputs with no audio track. */
  muted: boolean | null
}

/**
 * One entry in a scene, as OBS reports it.
 *
 * An entry is not necessarily a source: OBS lets a scene contain another scene,
 * and those come back from GetSceneItemList looking just like inputs. Keeping
 * `type` means the UI can tell a real source from a nested scene.
 */
export interface SceneItem {
  id: number
  sourceName: string
  enabled: boolean
  type: 'input' | 'scene' | 'group'
  /** OBS input kind, e.g. `ffmpeg_source`. Empty for scenes and groups. */
  kind: string
  /** Set when this item lives inside a group in the parent scene. */
  group?: string
}

// ---------------------------------------------------------------- Graphics

/** Logical graphics roles the app knows how to drive, independent of the installed pack. */
export const GRAPHICS_ROLES = [
  'scoreboard',
  'lowerThird',
  'playerIntro',
  'startingLineup',
  'coach',
  'sponsor',
  'fullscreen',
  'halftime',
  'final',
  'firstDown',
  'touchdown',
] as const
export type GraphicsRole = (typeof GRAPHICS_ROLES)[number]

export interface TemplateMapping {
  role: GraphicsRole
  /** Template path as CasparCG reports it from TLS, e.g. "SPORTS/SCOREBOARD". Empty = unmapped. */
  template: string
  layer: number
  /** How CasparCG should be handed the field data. Depends on the installed template. */
  dataFormat: 'xml' | 'json'
  /** Field name mapping: our field -> template field. Empty object = identity. */
  fields: Record<string, string>
}

export interface GraphicsStatus extends ServiceStatus {
  /** Name of the graphics engine in use, shown in the status panel. */
  engine: string
  version: string
  /** Template paths discovered on the server via AMCP TLS. */
  templates: string[]
  /** Roles currently on air, by role. */
  onAir: GraphicsRole[]
}

// ---------------------------------------------------------------- Game state

export interface Team {
  name: string
  abbr: string
  color: string
}

export interface GameState {
  sport: string
  homeTeam: Team
  awayTeam: Team
  homeScore: number
  awayScore: number
  period: string
  clock: string
  shotClock?: string
  possession: 'home' | 'away' | null
  homeFouls: number
  awayFouls: number
  homeTimeouts: number
  awayTimeouts: number
  down?: number
  distance?: number
  ballOn?: string
}

// ---------------------------------------------------------------- Sport profiles

export interface SportProfile {
  id: string
  name: string
  /** Which GameState keys the scoreboard page shows, in order. */
  fields: string[]
  periods: string[]
  periodLabel: string
  clockCountsDown: boolean
  defaultTimeouts: number
  /** Graphics roles offered on the Graphics page for this sport. */
  graphics: GraphicsRole[]
  replay: { durations: number[]; defaultDuration: number; defaultSpeed: number; returnToLive: boolean }
  checklist: string[]
}

// ---------------------------------------------------------------- Replay

export interface ReplayStatus extends ServiceStatus {
  bufferActive: boolean
  playing: boolean
  lastClip: string
  duration: number
  speed: number
}

// ---------------------------------------------------------------- Venues / presets

export interface Venue {
  id: string
  name: string
  obsHost: string
  obsPort: number
  graphicsHost: string
  graphicsPort: number
  graphicsChannel: number
  safeScene: string
  micInput: string
}

/** Checklists are stored per sport and venue: the same rig checks different things in the gym and on the field. */
export const checklistKey = (sport: string, venue: string) => `checklist:${sport}:${venue}`

// ---------------------------------------------------------------- Settings

export interface Settings {
  productionName: string
  demoMode: boolean
  studentMode: boolean
  role: 'director' | 'replay' | 'graphics' | 'admin'
  setupComplete: boolean
  obs: { host: string; port: number; password: string; autoConnect: boolean }
  graphics: {
    engine: 'casparcg'
    host: string
    port: number
    channel: number
    installPath: string
    autoConnect: boolean
  }
  replay: {
    /** OBS scene holding the replay media source. */
    scene: string
    /** OBS ffmpeg/media source the saved clip is loaded into. */
    mediaSource: string
    defaultDuration: number
    defaultSpeed: number
    returnToLive: boolean
  }
  api: { enabled: boolean; port: number; token: string; allowLan: boolean }
  ndi: { discovery: boolean }
  /** Show the program scene picture, as reported by OBS, on the Production page. */
  showProgramMonitor: boolean
  activeVenueId: string
  activeSport: string
  hotkeys: Record<string, string>
}

// ---------------------------------------------------------------- Logging

export type LogLevel = 'info' | 'warn' | 'error'
export interface LogEntry {
  t: number
  level: LogLevel
  scope: string
  msg: string
}

// ---------------------------------------------------------------- Aggregate

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
  /** Auto-checked from live status instead of by hand. */
  auto?: 'obs' | 'graphics' | 'stream' | 'record' | 'replay' | 'cameras'
}

export interface AppState {
  /** The running build, so a teacher can be told what a remote rig is on. */
  version: string
  settings: Settings
  obs: OBSStatus
  graphics: GraphicsStatus
  replay: ReplayStatus
  network: ServiceStatus
  /** Derived from obs.scenes on every change. Empty when OBS has no scenes. */
  cameras: Camera[]
  sceneOverrides: Record<string, SceneOverride>
  /** Inputs OBS currently has. */
  inputs: ObsInput[]
  /** Scene name -> its items, as OBS reports them. */
  sceneItems: Record<string, SceneItem[]>
  /** Input kinds this OBS build can create; the only ones we ever offer. */
  inputKinds: string[]
  ndiSources: string[]
  game: GameState
  sports: SportProfile[]
  venues: Venue[]
  mappings: TemplateMapping[]
  checklist: ChecklistItem[]
  logs: LogEntry[]
  /** Transient banners for the operator; cleared by the UI. */
  alerts: { id: string; level: LogLevel; msg: string }[]
}

/** Named events pushed over the local control API WebSocket. */
export type BusEvent =
  | { type: 'camera.status'; camera: Camera }
  | { type: 'obs.status'; status: OBSStatus }
  | { type: 'obs.sceneChanged'; scene: string }
  | { type: 'obs.previewChanged'; scene: string }
  | { type: 'obs.streamStarted' }
  | { type: 'obs.streamStopped' }
  | { type: 'obs.recordingStarted' }
  | { type: 'obs.recordingStopped' }
  | { type: 'replay.saved'; clip: string }
  | { type: 'graphics.connected' }
  | { type: 'graphics.disconnected' }
  | { type: 'graphics.played'; role: GraphicsRole }
  | { type: 'graphics.stopped'; role: GraphicsRole | null }
  | { type: 'game.updated'; game: GameState }
  | { type: 'system.warning'; msg: string }
