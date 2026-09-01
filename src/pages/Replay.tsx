import { useState } from 'react'
import { act, useApp } from '../lib/store'
import { Btn, Field, Led, Panel } from '../lib/ui'

const SPEEDS = [
  { label: 'Slow 25%', value: 25 },
  { label: 'Slow 50%', value: 50 },
  { label: 'Normal', value: 100 },
]

export default function Replay() {
  const s = useApp()
  const sport = s.sports.find((x) => x.id === s.settings.activeSport)
  const durations = sport?.replay.durations ?? [5, 10, 15]
  const [speed, setSpeed] = useState(s.settings.replay.defaultSpeed)
  const [seconds, setSeconds] = useState(s.settings.replay.defaultDuration)
  const ready = s.replay.bufferActive

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_340px] items-start">
      <Panel title="Replay">
        {!ready && (
          <p className="mb-3 px-3 py-2 border-l-4 border-warn bg-warn/15 text-sm">
            The OBS replay buffer is not running. Start it before the game — OBS can only save footage it has already buffered.
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {durations.map((d) => (
            <Btn key={d} big tone={d === seconds ? 'go' : 'neutral'} disabled={!ready} onClick={() => { setSeconds(d); void act('replay.last', { seconds: d, speed }) }}>
              {d} sec
            </Btn>
          ))}
          <Btn big tone="go" disabled={!ready} onClick={() => act('replay.save')}>Save</Btn>
          <Btn big disabled={!ready} onClick={() => act('replay.play')}>Play</Btn>
          <Btn big tone="live" onClick={() => act('replay.live')}>Live</Btn>
          {SPEEDS.map((sp) => (
            <Btn key={sp.value} big active={speed === sp.value} onClick={() => setSpeed(sp.value)}>{sp.label}</Btn>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Btn tone={ready ? 'live' : 'go'} onClick={() => act('replay.buffer', { on: !ready })}>
            {ready ? 'Stop buffer' : 'Start buffer'}
          </Btn>
          <Field label="Duration (s)" type="number" min={1} max={120} value={seconds} onChange={(v) => setSeconds(Number(v) || 1)} />
          <Field label="Speed (%)" type="number" min={10} max={200} value={speed} onChange={(v) => setSpeed(Number(v) || 100)} />
        </div>
      </Panel>

      <div className="grid gap-3">
        <Panel title="Status">
          <div className="space-y-2 text-sm">
            <Led state={ready ? 'connected' : 'off'} label={ready ? 'Buffer active' : 'Buffer off'} />
            <Led state={s.replay.playing ? 'live' : 'off'} label={s.replay.playing ? 'Replay on program' : 'Not playing'} />
            <p className="text-zinc-400 break-all num text-xs">Last clip: {s.replay.lastClip || '—'}</p>
          </div>
        </Panel>
        <Panel title="How this works">
          <p className="text-xs text-zinc-400 leading-relaxed">
            OBS owns the buffer length (Settings → Output → Replay Buffer). Saving writes the whole buffer to disk; this app then loads
            the clip into the OBS media source <span className="num text-zinc-200">{s.settings.replay.mediaSource || '(unset)'}</span> on scene{' '}
            <span className="num text-zinc-200">{s.settings.replay.scene || '(unset)'}</span>, seeks back {seconds}s and plays at {speed}%
            using the media source's speed control.
          </p>
        </Panel>
      </div>
    </div>
  )
}
