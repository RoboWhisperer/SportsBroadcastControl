import { act, useApp } from '../lib/store'
import { Btn, Led, Panel, hhmmss } from '../lib/ui'

export default function Monitoring() {
  const s = useApp()
  const camsOnline = s.cameras.filter((c) => c.online).length

  const rows: { label: string; state: Parameters<typeof Led>[0]['state']; detail: string }[] = [
    { label: 'OBS', state: s.obs.state, detail: s.obs.detail },
    { label: 'NDI', state: s.ndiSources.length ? 'connected' : 'off', detail: `${s.ndiSources.length} sources discovered` },
    { label: 'Cameras', state: camsOnline === s.cameras.length && camsOnline > 0 ? 'connected' : camsOnline ? 'connecting' : 'error', detail: `${camsOnline}/${s.cameras.length} online` },
    { label: s.graphics.engine, state: s.graphics.state, detail: s.graphics.detail },
    { label: 'Network', state: s.network.state, detail: s.network.detail },
    { label: 'Stream', state: s.obs.streaming ? 'live' : 'off', detail: s.obs.streaming ? `${hhmmss(s.obs.streamDuration)} · ${(s.obs.bitrate / 1000).toFixed(1)} Mbps · ${(s.obs.droppedFrames * 100).toFixed(2)}% dropped` : 'Off air' },
    { label: 'Recording', state: s.obs.recording ? 'live' : 'off', detail: s.obs.recording ? hhmmss(s.obs.recordDuration) : 'Not recording' },
    { label: 'Replay', state: s.replay.bufferActive ? 'connected' : 'off', detail: s.replay.detail },
    { label: 'Control API', state: s.settings.api.enabled ? 'connected' : 'off', detail: s.settings.api.enabled ? `port ${s.settings.api.port}${s.settings.api.allowLan ? ' (LAN)' : ' (localhost)'}` : 'Disabled' },
  ]

  return (
    <div className="grid gap-3 xl:grid-cols-[380px_1fr] items-start">
      <Panel title="System status">
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start justify-between gap-3 border-b border-edge/60 pb-2 last:border-0">
              <Led state={r.state} label={r.label} />
              <span className="text-xs text-zinc-400 text-right num max-w-[55%] wrap-break-word">{r.detail}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Diagnostics log"
        right={<Btn tone="ghost" className="py-1! px-2! text-[10px]!" onClick={() => act('logs.export')}>Export logs</Btn>}
      >
        <ol className="text-xs num space-y-0.5 max-h-[60vh] overflow-auto">
          {[...s.logs].reverse().map((l, i) => (
            <li key={`${l.t}-${i}`} className={`flex gap-2 ${l.level === 'error' ? 'text-live' : l.level === 'warn' ? 'text-warn' : 'text-zinc-400'}`}>
              <span className="shrink-0 text-zinc-600">{new Date(l.t).toLocaleTimeString()}</span>
              <span className="shrink-0 w-20 truncate uppercase text-zinc-500">{l.scope}</span>
              <span className="wrap-break-word">{l.msg}</span>
            </li>
          ))}
          {!s.logs.length && <li className="text-zinc-500">No log entries yet.</li>}
        </ol>
      </Panel>
    </div>
  )
}
