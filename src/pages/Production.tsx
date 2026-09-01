import { act, useApp, useUi } from '../lib/store'
import { Btn, Led, Panel, hhmmss, useConfirm } from '../lib/ui'
import type { Camera as AppCamera } from '../../shared/types'

export default function Production() {
  const s = useApp()
  const setPage = useUi((z) => z.setPage)
  const { ask, node } = useConfirm()
  const sport = s.sports.find((x) => x.id === s.settings.activeSport)
  const durations = sport?.replay.durations ?? [5, 10, 15]

  return (
    <div className="grid gap-3 xl:grid-cols-[2fr_1fr] items-start">
      {node}

      <div className="grid gap-3">
        <Panel
          title={s.obs.studioMode ? 'Cameras — click to load preview, then TAKE' : 'Cameras — click to take to program'}
          right={
            <Btn
              tone={s.obs.studioMode ? 'go' : 'ghost'}
              className="py-1! px-2! text-[10px]!"
              active={s.obs.studioMode}
              onClick={() => act('obs.studioMode', { on: !s.obs.studioMode })}
              title="OBS Studio Mode: preview a shot before cutting to it"
            >
              Studio mode {s.obs.studioMode ? 'on' : 'off'}
            </Btn>
          }
        >
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {s.cameras.map((c) => (
              <CameraTile key={c.id} camera={c} />
            ))}
              {!s.cameras.length && (
              <p className="text-zinc-500 text-sm col-span-full">
                {s.obs.state === 'connected'
                  ? 'OBS has no scenes. Add one on the Sources page, or build your scenes in OBS.'
                  : `Waiting for OBS — ${s.obs.detail}`}
              </p>
            )}
          </div>
          {s.obs.studioMode && (
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 items-center">
              <p className="text-xs text-zinc-400">
                Preview: <span className="num text-preview font-bold">{s.obs.previewScene || '—'}</span>
                {'  →  '}
                Program: <span className="num text-live font-bold">{s.obs.currentScene || '—'}</span>
              </p>
              <Btn big tone="live" className="min-w-[180px]" disabled={!s.obs.previewScene} onClick={() => act('obs.transition')}>
                Take ⏎
              </Btn>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-3">
        <Panel title="Program">
          {s.settings.showProgramMonitor && <ProgramMonitor />}
          <p className="text-2xl font-bold uppercase tracking-wide truncate">{s.obs.currentScene || '—'}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {s.obs.scenes.slice(0, 8).map((sc) => (
              <SceneChip key={sc} scene={sc} />
            ))}
          </div>
          {s.obs.scenes.length > 8 && (
            <Btn tone="ghost" className="w-full mt-2 text-[10px]!" onClick={() => setPage('scenes')}>
              All {s.obs.scenes.length} scenes
            </Btn>
          )}
        </Panel>

        <Panel title="Broadcast">
          <div className="grid grid-cols-2 gap-3">
            <Btn
              big
              tone={s.obs.streaming ? 'live' : 'go'}
              onClick={() =>
                s.obs.streaming
                  ? ask('Stop live stream?', 'The broadcast is on air. Viewers will be disconnected immediately.', 'Stop stream', () => act('stream.set', { on: false }))
                  : act('stream.set', { on: true })
              }
            >
              {s.obs.streaming ? `Stop Stream ${hhmmss(s.obs.streamDuration)}` : 'Go Live'}
            </Btn>
            <Btn
              big
              tone={s.obs.recording ? 'live' : 'neutral'}
              onClick={() =>
                s.obs.recording
                  ? ask('Stop recording?', 'The recording will be finalised and closed.', 'Stop recording', () => act('record.set', { on: false }))
                  : act('record.set', { on: true })
              }
            >
              {s.obs.recording ? `Stop Rec ${hhmmss(s.obs.recordDuration)}` : 'Record'}
            </Btn>
          </div>
          {s.obs.recording && (
            <Btn
              tone={s.obs.recordPaused ? 'warn' : 'ghost'}
              className="w-full mt-2 text-xs!"
              active={s.obs.recordPaused}
              onClick={() => act('record.pause', { on: !s.obs.recordPaused })}
            >
              {s.obs.recordPaused ? 'Resume recording' : 'Pause recording (halftime)'}
            </Btn>
          )}
        </Panel>

        <Panel title="Quick replay">
          <div className="grid grid-cols-3 gap-2">
            {durations.map((d) => (
              <Btn key={d} onClick={() => act('replay.last', { seconds: d, speed: s.settings.replay.defaultSpeed })} disabled={!s.replay.bufferActive}>
                {d} sec
              </Btn>
            ))}
            <Btn tone="go" onClick={() => act('replay.save')} disabled={!s.replay.bufferActive}>Save</Btn>
            <Btn onClick={() => act('replay.play')} disabled={!s.replay.bufferActive}>Play</Btn>
            <Btn tone="live" onClick={() => act('replay.live')}>Live</Btn>
          </div>
          {!s.replay.bufferActive && (
            <Btn tone="warn" className="w-full mt-2" onClick={() => act('replay.buffer', { on: true })}>Start replay buffer</Btn>
          )}
        </Panel>

        <Panel title="Score">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            <div className="truncate">
              <p className="text-xs uppercase tracking-widest text-zinc-400 truncate">{s.game.homeTeam.abbr}</p>
              <p className="text-4xl font-bold num">{s.game.homeScore}</p>
            </div>
            <div className="text-zinc-500 num text-sm">
              <p>{s.game.period}</p>
              <p>{s.game.clock}</p>
            </div>
            <div className="truncate">
              <p className="text-xs uppercase tracking-widest text-zinc-400 truncate">{s.game.awayTeam.abbr}</p>
              <p className="text-4xl font-bold num">{s.game.awayScore}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Btn tone={s.graphics.onAir.includes('scoreboard') ? 'live' : 'go'} onClick={() => act(s.graphics.onAir.includes('scoreboard') ? 'graphics.stop' : 'graphics.play', { role: 'scoreboard' })}>
              {s.graphics.onAir.includes('scoreboard') ? 'Hide board' : 'Show board'}
            </Btn>
            <Btn tone="ghost" onClick={() => act('graphics.play', { role: 'sponsor' })}>Sponsor</Btn>
          </div>
        </Panel>
      </div>
    </div>
  )
}


function CameraTile({ camera: c }: { camera: AppCamera }) {
  const s = useApp()
  const thumb = useUi((z) => z.thumbs[c.id])
  const onProgram = s.obs.currentScene === c.id
  const onPreview = s.obs.studioMode && s.obs.previewScene === c.id

  return (
    <button
      onClick={() => act('camera.take', { id: c.id })}
      aria-pressed={onProgram}
      aria-label={`${c.name}, ${onProgram ? 'on program' : onPreview ? 'on preview' : 'standby'}, ${c.online ? 'connected' : 'offline'}`}
      className={`tap text-left p-3 rounded-xs border-2 min-h-[170px] flex flex-col transition-colors
        ${onProgram ? 'border-live bg-live/25' : onPreview ? 'border-preview bg-preview/15' : 'border-edge bg-surface hover:bg-edge'}`}
    >
      <span className="text-lg font-bold uppercase tracking-wide truncate">{c.name}</span>
      <span className="text-[11px] text-zinc-500 truncate mt-0.5">{c.name === c.id ? 'OBS scene' : c.id}</span>

      <div className="relative flex-1 my-2 bg-black/60 rounded-xs border border-edge/50 overflow-hidden grid place-items-center">
        {thumb ? (
          <img src={thumb} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">no preview</span>
        )}
        {(onProgram || onPreview) && (
          <span
            className={`absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold tracking-widest rounded-xs
              ${onProgram ? 'bg-live text-white' : 'bg-preview text-black'}`}
          >
            {onProgram ? 'PGM' : 'PVW'}
          </span>
        )}
      </div>

      {c.online === null ? (
        <span className="text-[10px] uppercase tracking-widest text-zinc-600">No health check</span>
      ) : (
        <Led state={c.online ? 'connected' : 'error'} label={c.online ? 'Connected' : 'Offline'} />
      )}
    </button>
  )
}


/** Compact scene preview in the Production rail; the Scenes page has the full grid. */
function SceneChip({ scene }: { scene: string }) {
  const s = useApp()
  const thumb = useUi((z) => z.thumbs[scene])
  const onProgram = s.obs.currentScene === scene
  const onPreview = s.obs.studioMode && s.obs.previewScene === scene
  return (
    <button
      onClick={() => act(s.obs.studioMode ? 'obs.setPreview' : 'obs.setScene', { scene })}
      aria-pressed={onProgram}
      aria-label={`${scene}${onProgram ? ', on program' : onPreview ? ', on preview' : ''}`}
      className={`tap min-h-0! text-left rounded-xs border overflow-hidden transition-colors
        ${onProgram ? 'border-live bg-live/20' : onPreview ? 'border-preview bg-preview/15' : 'border-edge bg-surface hover:bg-edge'}`}
    >
      <div className="relative aspect-video bg-black">
        {thumb ? (
          <img src={thumb} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
        {/* Status must never be colour alone. */}
        {(onProgram || onPreview) && (
          <span
            className={`absolute top-0.5 left-0.5 px-1 text-[9px] font-bold tracking-widest rounded-xs
              ${onProgram ? 'bg-live text-white' : 'bg-preview text-black'}`}
          >
            {onProgram ? 'PGM' : 'PVW'}
          </span>
        )}
      </div>
      <span className="block px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide truncate">{scene}</span>
    </button>
  )
}


/** The program scene as OBS reports it. A picture from OBS, not a capture. */
function ProgramMonitor() {
  const s = useApp()
  const thumb = useUi((z) => z.thumbs[s.obs.currentScene])
  return (
    <div className="relative mb-3 aspect-video bg-black rounded-xs overflow-hidden border-2 border-live">
      {thumb ? (
        <img src={thumb} alt="" aria-hidden className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="grid place-items-center h-full text-[10px] uppercase tracking-[0.2em] text-zinc-600">waiting for OBS…</div>
      )}
      <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold tracking-widest rounded-xs bg-live text-white">PGM</span>
    </div>
  )
}
