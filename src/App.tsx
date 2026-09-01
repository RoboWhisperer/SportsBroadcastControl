import type { ReactElement } from 'react'
import { act, useUi, type Page } from './lib/store'
import { useHotkeys } from './lib/hotkeys'
import { Btn, Led, hhmmss, useConfirm } from './lib/ui'
import { isRestricted, unlocked } from './lib/access'
import Production from './pages/Production'
import Sources from './pages/Sources'
import Scenes from './pages/Scenes'
import Replay from './pages/Replay'
import Scoreboard from './pages/Scoreboard'
import Graphics from './pages/Graphics'
import Audio from './pages/Audio'
import Checklist from './pages/Checklist'
import Monitoring from './pages/Monitoring'
import SettingsPage from './pages/Settings'
import Setup from './pages/Setup'
import type { AppState } from '../shared/types'

const PAGES: { id: Page; label: string; advanced?: boolean }[] = [
  { id: 'production', label: 'Production' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'sources', label: 'Sources' },
  { id: 'replay', label: 'Replay' },
  { id: 'scoreboard', label: 'Scoreboard' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'monitoring', label: 'Monitoring', advanced: true },
  { id: 'settings', label: 'Settings', advanced: true },
]

/** Pages each operator role is allowed to open. Administrators see everything. */
const ROLE_PAGES: Record<AppState['settings']['role'], Page[] | null> = {
  admin: null,
  director: ['production', 'scenes', 'sources', 'replay', 'scoreboard', 'graphics', 'audio', 'checklist', 'monitoring'],
  replay: ['production', 'scenes', 'replay', 'checklist'],
  graphics: ['scoreboard', 'graphics', 'checklist'],
}

const VIEWS: Record<Page, () => ReactElement> = {
  production: Production,
  scenes: Scenes,
  sources: Sources,
  replay: Replay,
  scoreboard: Scoreboard,
  graphics: Graphics,
  audio: Audio,
  checklist: Checklist,
  monitoring: Monitoring,
  settings: SettingsPage,
  setup: Setup,
}

export default function App() {
  const s = useUi((z) => z.s)
  const page = useUi((z) => z.page)
  const setPage = useUi((z) => z.setPage)
  useHotkeys(s)

  if (!s) {
    return (
      <div className="h-full grid place-items-center text-zinc-500 uppercase tracking-[0.3em] text-sm">
        Starting Sports Broadcast Control...
      </div>
    )
  }
  if (page === 'setup') return <Setup />

  const allowed = ROLE_PAGES[s.settings.role]
  const nav = PAGES.filter((p) => (!s.settings.studentMode || !p.advanced) && (!allowed || allowed.includes(p.id)))
  const View = VIEWS[nav.some((n) => n.id === page) ? page : (nav[0]?.id ?? 'production')]

  return (
    <div className="h-full grid grid-rows-[auto_1fr_auto] bg-[#0d0f12]">
      <TitleBar s={s} />
      <div className="grid grid-cols-[168px_1fr] min-h-0">
        <nav aria-label="Sections" className="border-r border-edge bg-panel flex flex-col min-h-0">
          <ul className="flex-1 overflow-auto py-1">
            {nav.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setPage(p.id)}
                  aria-current={page === p.id ? 'page' : undefined}
                  className={`tap w-full text-left px-4 py-3 text-sm font-semibold uppercase tracking-wide border-l-4 transition-colors
                    ${page === p.id ? 'border-sky-400 bg-surface text-white' : 'border-transparent text-zinc-400 hover:bg-surface hover:text-zinc-100'}`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
          <AccessLock />
          <Emergency />
        </nav>
        <main className="min-h-0 overflow-auto p-3">
          <Alerts s={s} />
          <View />
        </main>
      </div>
      <StatusBar s={s} />
    </div>
  )
}

function TitleBar({ s }: { s: AppState }) {
  return (
    <header className="flex items-center gap-4 px-4 h-12 border-b border-edge bg-panel shrink-0">
      <h1 className="text-sm font-bold uppercase tracking-[0.2em]">Sports Broadcast Control</h1>
      <span className="text-xs text-zinc-500 truncate">{s.settings.productionName}</span>
      {s.settings.demoMode && (
        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-warn text-black rounded-xs">
          Demo mode — not on air
        </span>
      )}
      <div className="ml-auto flex items-center gap-5">
        <Led state={s.obs.streaming ? 'live' : 'off'} label={s.obs.streaming ? `Live ${hhmmss(s.obs.streamDuration)}` : 'Off air'} />
        <Led state={s.obs.recording ? 'live' : 'off'} label={s.obs.recording ? `Rec ${hhmmss(s.obs.recordDuration)}` : 'Not recording'} />
      </div>
    </header>
  )
}

function StatusBar({ s }: { s: AppState }) {
  const camsOnline = s.cameras.filter((c) => c.online).length
  return (
    <footer className="flex items-center gap-6 px-4 h-10 border-t border-edge bg-panel text-zinc-300 shrink-0 overflow-x-auto">
      <Led state={s.obs.state} label="OBS" title={s.obs.detail} />
      <Led state={camsOnline ? 'connected' : 'off'} label={`NDI ${s.ndiSources.length} src`} title={`${camsOnline}/${s.cameras.length} cameras online`} />
      <Led state={s.graphics.state} label={s.graphics.engine} title={s.graphics.detail} />
      <Led state={s.replay.bufferActive ? 'connected' : 'off'} label="Replay" title={s.replay.detail} />
      <Led state={s.obs.streaming ? 'live' : 'off'} label="Stream" />
      <div className="ml-auto flex items-center gap-4 text-xs num">
        {s.obs.streaming && <span>{(s.obs.bitrate / 1000).toFixed(1)} Mbps</span>}
        {s.obs.streaming && <span className={s.obs.droppedFrames > 0.01 ? 'text-live font-bold' : ''}>drop {(s.obs.droppedFrames * 100).toFixed(1)}%</span>}
        <span className="uppercase tracking-widest text-zinc-500">{s.settings.activeSport}</span>
      </div>
    </footer>
  )
}

function Alerts({ s }: { s: AppState }) {
  if (!s.alerts.length) return null
  return (
    <div role="status" aria-live="polite" className="mb-3 space-y-2">
      {s.alerts.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-3 px-3 py-2 border-l-4 rounded-xs text-sm
            ${a.level === 'error' ? 'border-live bg-live/15' : 'border-warn bg-warn/15'}`}
        >
          <span aria-hidden className="font-bold">⚠</span>
          <span className="flex-1">{a.msg}</span>
          <button className="tap px-2 text-zinc-400 hover:text-white" aria-label="Dismiss" onClick={() => act('alert.dismiss', { id: a.id })}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * The way out of student mode or a restricted role. Deliberately plain and
 * confirmed rather than hidden: these are a guard against fumbling during a
 * broadcast, not a security boundary, and being unable to reach Settings on your
 * own machine is worse than a student switching the view back.
 */
function AccessLock() {
  const s = useUi((z) => z.s)!
  const { ask, node } = useConfirm()
  if (!isRestricted(s.settings)) return null
  const what = s.settings.studentMode ? 'student view' : `the ${s.settings.role} role`
  return (
    <div className="border-t border-edge p-2 shrink-0">
      {node}
      <Btn
        tone="ghost"
        className="w-full !px-2 !text-[10px]"
        onClick={() =>
          ask(
            'Show all pages?',
            `Leaves ${what} and restores Settings, Monitoring and full administrator access. Nothing about the production changes.`,
            'Show all pages',
            () => act('settings.save', unlocked(s.settings)),
          )
        }
      >
        {s.settings.studentMode ? 'Exit student view' : 'Unlock all pages'}
      </Btn>
    </div>
  )
}

/** Always reachable, on every page, from the bottom of the navigation rail. */
function Emergency() {
  return (
    <div className="border-t border-edge p-2 space-y-2 shrink-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Emergency</p>
      <Btn tone="live" className="w-full px-2! text-xs!" onClick={() => act('emergency.safe')}>Safe Scene</Btn>
      <Btn tone="warn" className="w-full px-2! text-xs!" onClick={() => act('emergency.mute')}>Mute Mic</Btn>
      <Btn tone="warn" className="w-full px-2! text-xs!" onClick={() => act('graphics.clear')}>End Graphics</Btn>
      <Btn tone="ghost" className="w-full px-2! text-xs!" onClick={() => act('replay.live')}>Return to Live</Btn>
    </div>
  )
}
