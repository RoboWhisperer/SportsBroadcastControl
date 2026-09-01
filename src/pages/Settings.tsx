import { useState } from 'react'
import { act, useApp, useUi } from '../lib/store'
import { Btn, Field, Led, Panel, useConfirm } from '../lib/ui'
import { comboOf } from '../lib/keys'
import type { Settings, Venue } from '../../shared/types'

export default function SettingsPage() {
  const s = useApp()
  const save = (p: Partial<Settings>) => act('settings.save', { ...s.settings, ...p })
  const [revealToken, setRevealToken] = useState(false)

  return (
    <div className="grid gap-3 xl:grid-cols-2 items-start">
      <div className="xl:col-span-2">
        <Session />
      </div>

      <Panel title="General">
        <div className="grid gap-3">
          <Field label="Production name" value={s.settings.productionName} onChange={(v) => save({ productionName: v })} />
          <Field
            label="Operator role" type="select" value={s.settings.role}
            onChange={(v) => save({ role: v as Settings['role'] })}
            options={[
              { value: 'admin', label: 'Administrator — everything' },
              { value: 'director', label: 'Director — production, cameras, replay, graphics' },
              { value: 'replay', label: 'Replay operator' },
              { value: 'graphics', label: 'Graphics operator' },
            ]}
          />
          <Field
            label="Interface" type="select" value={s.settings.studentMode ? 'student' : 'advanced'}
            onChange={(v) => save({ studentMode: v === 'student' })}
            options={[{ value: 'advanced', label: 'Advanced — all pages' }, { value: 'student', label: 'Student — hides configuration' }]}
          />
          <Field
            label="Mode" type="select" value={s.settings.demoMode ? 'demo' : 'live'}
            onChange={(v) => save({ demoMode: v === 'demo' })}
            options={[{ value: 'demo', label: 'Demo / test — mock devices, nothing on air' }, { value: 'live', label: 'Live production — real OBS and graphics' }]}
            hint="Switching restarts every integration."
          />
          <Field
            label="Venue" type="select" value={s.settings.activeVenueId}
            onChange={(v) => act('venue.load', { id: v })}
            options={s.venues.map((v) => ({ value: v.id, label: v.name }))}
          />
          <Field
            label="Sport preset" type="select" value={s.settings.activeSport}
            onChange={(v) => act('sport.load', { id: v })}
            options={s.sports.map((x) => ({ value: x.id, label: x.name }))}
          />
        </div>
      </Panel>

      <Panel title="OBS Studio" right={<Led state={s.obs.state} label={s.obs.state} title={s.obs.detail} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Host" value={s.settings.obs.host} onChange={(v) => save({ obs: { ...s.settings.obs, host: v } })} />
          <Field label="Port" type="number" value={s.settings.obs.port} onChange={(v) => save({ obs: { ...s.settings.obs, port: Number(v) || 4455 } })} />
          <Field
            label="Password" type="password" value={s.settings.obs.password}
            onChange={(v) => save({ obs: { ...s.settings.obs, password: v } })}
            hint="Stored with the OS keystore (DPAPI on Windows)."
          />
          <Field
            label="Connect on start" type="select" value={String(s.settings.obs.autoConnect)}
            onChange={(v) => save({ obs: { ...s.settings.obs, autoConnect: v === 'true' } })}
            options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-3">OBS → Tools → WebSocket Server Settings. Enable the server and copy the password here.</p>
        <div className="flex gap-2 mt-3">
          <Btn onClick={() => act('obs.connect', { on: true })}>Connect</Btn>
          <Btn tone="ghost" onClick={() => act('obs.connect', { on: false })}>Disconnect</Btn>
        </div>
      </Panel>

      <Panel title="Graphics — CasparCG" right={<Led state={s.graphics.state} label={s.graphics.state} title={s.graphics.detail} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Host" value={s.settings.graphics.host} onChange={(v) => save({ graphics: { ...s.settings.graphics, host: v } })} />
          <Field label="AMCP port" type="number" value={s.settings.graphics.port} onChange={(v) => save({ graphics: { ...s.settings.graphics, port: Number(v) || 5250 } })} />
          <Field label="Channel" type="number" min={1} value={s.settings.graphics.channel} onChange={(v) => save({ graphics: { ...s.settings.graphics, channel: Number(v) || 1 } })} />
          <Field
            label="Connect on start" type="select" value={String(s.settings.graphics.autoConnect)}
            onChange={(v) => save({ graphics: { ...s.settings.graphics, autoConnect: v === 'true' } })}
            options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          />
          <div className="sm:col-span-2">
            <Field
              label="Installation folder" value={s.settings.graphics.installPath}
              onChange={(v) => save({ graphics: { ...s.settings.graphics, installPath: v } })}
              hint="Where casparcg.exe and the template folder live. Used by the setup guide only."
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn onClick={() => act('graphics.connect', { on: true })}>Connect</Btn>
          <Btn tone="ghost" onClick={() => act('graphics.connect', { on: false })}>Disconnect</Btn>
          <Btn tone="ghost" onClick={() => act('graphics.refresh')}>Rescan templates</Btn>
          <Btn tone="ghost" onClick={() => act('shell.open', { url: 'https://github.com/CasparCG/server/releases' })}>Download CasparCG</Btn>
        </div>
      </Panel>

      <Panel title="Replay">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Replay scene" type="select" value={s.settings.replay.scene}
            onChange={(v) => save({ replay: { ...s.settings.replay, scene: v } })}
            options={[{ value: '', label: s.obs.scenes.length ? '— none —' : '— OBS has no scenes —' }, ...s.obs.scenes.map((x) => ({ value: x, label: x }))]}
            hint="Only scenes OBS has. Create one on the Sources page if it is missing."
          />
          <Field
            label="Media source" type="select" value={s.settings.replay.mediaSource}
            onChange={(v) => save({ replay: { ...s.settings.replay, mediaSource: v } })}
            options={[
              { value: '', label: '— none —' },
              ...s.inputs.filter((i) => i.kind.includes('ffmpeg') || i.kind.includes('media')).map((i) => ({ value: i.name, label: i.name })),
            ]}
            hint="A media source OBS already has; the saved clip is loaded into it."
          />
          <MakeReplayTargets />
          <Field label="Default duration (s)" type="number" min={1} max={120} value={s.settings.replay.defaultDuration} onChange={(v) => save({ replay: { ...s.settings.replay, defaultDuration: Number(v) || 10 } })} />
          <Field label="Default speed (%)" type="number" min={10} max={200} value={s.settings.replay.defaultSpeed} onChange={(v) => save({ replay: { ...s.settings.replay, defaultSpeed: Number(v) || 50 } })} />
          <Field
            label="After replay" type="select" value={String(s.settings.replay.returnToLive)}
            onChange={(v) => save({ replay: { ...s.settings.replay, returnToLive: v === 'true' } })}
            options={[{ value: 'true', label: 'Return to live automatically' }, { value: 'false', label: 'Stay on the replay scene' }]}
          />
        </div>
      </Panel>

      <Panel title="Local control API (Stream Deck)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Enabled" type="select" value={String(s.settings.api.enabled)}
            onChange={(v) => save({ api: { ...s.settings.api, enabled: v === 'true' } })}
            options={[{ value: 'true', label: 'Enabled' }, { value: 'false', label: 'Disabled' }]}
          />
          <Field label="Port" type="number" value={s.settings.api.port} onChange={(v) => save({ api: { ...s.settings.api, port: Number(v) || 7788 } })} />
          <div className="sm:col-span-2">
            <Field
              label="Token" type={revealToken ? 'text' : 'password'} value={s.settings.api.token}
              onChange={(v) => save({ api: { ...s.settings.api, token: v } })}
              hint="Required on every request as ?token= or an Authorization: Bearer header."
            />
          </div>
          <Field
            label="Network access" type="select" value={String(s.settings.api.allowLan)}
            onChange={(v) => save({ api: { ...s.settings.api, allowLan: v === 'true' } })}
            options={[{ value: 'false', label: 'This computer only (recommended)' }, { value: 'true', label: 'Allow other devices on the LAN' }]}
            hint="Never expose this port to the Internet."
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn tone="ghost" onClick={() => setRevealToken((v) => !v)}>{revealToken ? 'Hide token' : 'Show token'}</Btn>
          <Btn tone="ghost" onClick={() => save({ api: { ...s.settings.api, token: crypto.randomUUID().replace(/-/g, '') } })}>Regenerate token</Btn>
          <Btn onClick={() => act('api.restart')}>Restart API</Btn>
        </div>
      </Panel>

      <Panel title="Program monitor">
        <Field
          label="Show program picture"
          type="select"
          value={String(s.settings.showProgramMonitor)}
          onChange={(v) => save({ showProgramMonitor: v === 'true' })}
          options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          hint="A still of the program scene, refreshed every 2s from OBS, at the top of the Production page."
        />
        <p className="text-xs text-zinc-500 mt-2">
          The picture comes from OBS over the WebSocket. This app never opens a camera, a screen or a capture device — for
          full-motion monitoring use OBS Multiview on a second screen.
        </p>
      </Panel>

      <Panel title="NDI">
        <Field
          label="Discovery" type="select" value={String(s.settings.ndi.discovery)}
          onChange={(v) => save({ ndi: { discovery: v === 'true' } })}
          options={[{ value: 'true', label: 'Automatic (mDNS)' }, { value: 'false', label: 'Off — map sources manually' }]}
          hint="Sources are matched to cameras by name on the Cameras page."
        />
      </Panel>

      <Venues />
      <Hotkeys />
    </div>
  )
}

/** Start-of-session actions: a fresh game, or a second pass through the wizard. */
/** The escape hatch: if OBS lacks a replay target, make one over the WebSocket. */
function MakeReplayTargets() {
  const s = useApp()
  const cfg = s.settings.replay
  const sceneMissing = !cfg.scene || !s.obs.scenes.includes(cfg.scene)
  const sourceMissing = !cfg.mediaSource || !s.inputs.some((i) => i.name === cfg.mediaSource)
  const canCreate = s.obs.state === 'connected' && (sceneMissing || sourceMissing)
  if (!canCreate) return null

  const create = async () => {
    const scene = cfg.scene || 'REPLAY'
    const source = cfg.mediaSource || 'Replay Clip'
    if (!s.obs.scenes.includes(scene)) await act('scene.create', { name: scene })
    if (!s.inputs.some((i) => i.name === source)) {
      await act('source.create', { scene, name: source, kind: 'ffmpeg_source', settings: { is_local_file: true, looping: false } })
    }
    await act('settings.save', { ...s.settings, replay: { ...cfg, scene, mediaSource: source } })
  }

  return (
    <div className="sm:col-span-2">
      <Btn tone="warn" className="w-full text-xs!" onClick={create}>
        Create the missing replay {sceneMissing && sourceMissing ? 'scene and media source' : sceneMissing ? 'scene' : 'media source'} in OBS
      </Btn>
      <p className="text-[11px] text-zinc-500 mt-1">Adds them to OBS over the WebSocket, then points these settings at them.</p>
    </div>
  )
}

function Session() {
  const s = useApp()
  const setPage = useUi((z) => z.setPage)
  const { ask, node } = useConfirm()
  const profile = s.sports.find((x) => x.id === s.settings.activeSport)

  return (
    <Panel title="Session">
      {node}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Btn
            tone="go"
            className="w-full"
            onClick={() =>
              ask(
                'Start a new game?',
                'Clears the score, period and clock, takes any graphic off air and un-ticks the pre-game checklist. Team names, venue and all settings are kept. The stream and recording are not touched.',
                'New game',
                () => act('game.new'),
              )
            }
          >
            Start new game
          </Btn>
          <p className="text-xs text-zinc-500 mt-2">
            For the next fixture of the day. Currently {profile?.name ?? 'Generic'}:{' '}
            <span className="num">{s.game.homeTeam.abbr} {s.game.homeScore}–{s.game.awayScore} {s.game.awayTeam.abbr}</span>.
          </p>
        </div>
        <div>
          <Btn className="w-full" onClick={() => setPage('setup')}>Run setup wizard again</Btn>
          <p className="text-xs text-zinc-500 mt-2">
            Walks through production name, OBS, graphics, templates, cameras, venue and sport, testing each connection. It only reads
            and edits settings — nothing is reset by opening it.
          </p>
        </div>
      </div>
    </Panel>
  )
}

function Venues() {
  const s = useApp()
  const save = (v: Venue[]) => act('venues.save', v)
  const patch = (id: string, p: Partial<Venue>) => save(s.venues.map((v) => (v.id === id ? { ...v, ...p } : v)))

  return (
    <Panel
      title="Venues"
      right={
        <Btn
          className="py-1! px-2! text-[10px]!"
          onClick={() =>
            save([
              ...s.venues,
              { id: String(Date.now()), name: 'New venue', obsHost: '127.0.0.1', obsPort: 4455, graphicsHost: '127.0.0.1', graphicsPort: 5250, graphicsChannel: 1, safeScene: '', micInput: '' },
            ])
          }
        >
          Add
        </Btn>
      }
    >
      <div className="space-y-3">
        {s.venues.map((v) => (
          <div key={v.id} className="border border-edge rounded-xs p-3 bg-surface grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={v.name} onChange={(x) => patch(v.id, { name: x })} />
            <Field label="OBS host" value={v.obsHost} onChange={(x) => patch(v.id, { obsHost: x })} />
            <Field label="OBS port" type="number" value={v.obsPort} onChange={(x) => patch(v.id, { obsPort: Number(x) || 4455 })} />
            <Field label="Graphics host" value={v.graphicsHost} onChange={(x) => patch(v.id, { graphicsHost: x })} />
            <Field label="Graphics port" type="number" value={v.graphicsPort} onChange={(x) => patch(v.id, { graphicsPort: Number(x) || 5250 })} />
            <Field label="Graphics channel" type="number" min={1} value={v.graphicsChannel} onChange={(x) => patch(v.id, { graphicsChannel: Number(x) || 1 })} />
            <Field
              label="Safe scene" type="select" value={v.safeScene}
              onChange={(x) => patch(v.id, { safeScene: x })}
              options={[{ value: '', label: '— none —' }, ...s.obs.scenes.map((x) => ({ value: x, label: x }))]}
              hint="Used by the emergency SAFE SCENE button."
            />
            <Field
              label="Mic input" type="select" value={v.micInput}
              onChange={(x) => patch(v.id, { micInput: x })}
              options={[{ value: '', label: '— none —' }, ...s.inputs.filter((i) => i.muted !== null).map((i) => ({ value: i.name, label: i.name }))]}
              hint="Used by emergency MUTE MIC. Audio inputs OBS reports."
            />
            <div className="sm:col-span-2 flex gap-2">
              <Btn className="py-1.5! text-xs!" onClick={() => act('venue.load', { id: v.id })}>Load venue</Btn>
              {s.venues.length > 1 && (
                <Btn tone="ghost" className="py-1.5! text-xs!" onClick={() => save(s.venues.filter((x) => x.id !== v.id))}>Remove</Btn>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Hotkeys() {
  const s = useApp()
  const entries = Object.entries(s.settings.hotkeys)
  const set = (hotkeys: Record<string, string>) => act('settings.save', { ...s.settings, hotkeys })
  const [newKey, setNewKey] = useState('')
  const [newCmd, setNewCmd] = useState('camera:1')
  const taken = newKey in s.settings.hotkeys

  return (
    <Panel title="Keyboard shortcuts">
      <p className="text-xs text-zinc-500 mb-3">
        Commands: <span className="num">camera:ID</span>, <span className="num">scene:NAME</span>, <span className="num">replay:last|slow|save|live</span>,{' '}
        <span className="num">graphics:ROLE|clear</span>, <span className="num">record:toggle</span>, <span className="num">stream:start</span>,{' '}
        <span className="num">obs:transition|studio</span>, <span className="num">emergency:safe|mute</span>. Stopping a live stream is
        deliberately not bindable.
      </p>
      <div className="space-y-2">
        {entries.map(([key, cmd]) => (
          <div key={key} className="grid grid-cols-[120px_1fr_auto] gap-2 items-center">
            <kbd className="num text-xs px-2 py-2 border border-edge rounded-xs text-center bg-[#0d0f12]">{key}</kbd>
            <input
              className="tap bg-[#0d0f12] border border-edge rounded-xs px-3 py-2 text-sm num focus:border-sky-400"
              value={cmd}
              aria-label={`Command for ${key}`}
              onChange={(e) => set({ ...s.settings.hotkeys, [key]: e.target.value })}
            />
            <Btn
              tone="ghost" className="py-1.5! px-2! text-[10px]!"
              onClick={() => {
                const next = { ...s.settings.hotkeys }
                delete next[key]
                set(next)
              }}
            >
              Remove
            </Btn>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-edge grid grid-cols-[120px_1fr_auto] gap-2 items-center">
        <button
          type="button"
          onKeyDown={(e) => {
            if (e.key === 'Tab') return
            e.preventDefault()
            setNewKey(comboOf(e.nativeEvent))
          }}
          className="tap num text-xs px-2 py-2 border border-dashed border-edge rounded-xs text-center bg-[#0d0f12] focus:border-sky-400"
        >
          {newKey || 'press a key'}
        </button>
        <input
          className="tap bg-[#0d0f12] border border-edge rounded-xs px-3 py-2 text-sm num focus:border-sky-400"
          value={newCmd}
          aria-label="Command for the new shortcut"
          onChange={(e) => setNewCmd(e.target.value)}
        />
        <Btn
          className="py-1.5! px-3! text-[10px]!"
          disabled={!newKey || !newCmd || taken}
          title={taken ? `${newKey} is already bound` : 'Add shortcut'}
          onClick={() => {
            set({ ...s.settings.hotkeys, [newKey]: newCmd })
            setNewKey('')
          }}
        >
          Add
        </Btn>
      </div>
      {taken && <p className="text-[11px] text-warn mt-1">{newKey} is already bound to {s.settings.hotkeys[newKey]}.</p>}
    </Panel>
  )
}
