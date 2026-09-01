import { useEffect, useState } from 'react'
import { act, useApp } from '../lib/store'
import { Btn, Led, Panel } from '../lib/ui'

export default function Audio() {
  const s = useApp()
  const [inputs, setInputs] = useState<{ name: string; muted: boolean }[]>([])

  const refresh = () => {
    void act('audio.inputs').then((r) => setInputs((r as { name: string; muted: boolean }[]) ?? []))
  }
  useEffect(refresh, [s.obs.state])

  return (
    <Panel title="Audio" right={<Btn tone="ghost" className="py-1! px-2! text-[10px]!" onClick={refresh}>Refresh</Btn>}>
      {s.obs.state !== 'connected' ? (
        <p className="text-sm text-zinc-500">OBS is not connected — audio sources are owned by OBS.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inputs.map((i) => (
            <div key={i.name} className="border border-edge rounded-xs p-3 bg-surface flex flex-col gap-3">
              <Led state={i.muted ? 'error' : 'connected'} label={i.muted ? 'Muted' : 'Live'} />
              <span className="font-semibold truncate">{i.name}</span>
              <Btn
                tone={i.muted ? 'go' : 'live'}
                onClick={() => {
                  void act('audio.mute', { input: i.name, muted: !i.muted })
                  setInputs((xs) => xs.map((x) => (x.name === i.name ? { ...x, muted: !x.muted } : x)))
                }}
              >
                {i.muted ? 'Unmute' : 'Mute'}
              </Btn>
            </div>
          ))}
          {!inputs.length && <p className="text-sm text-zinc-500">No audio inputs reported by OBS.</p>}
        </div>
      )}
    </Panel>
  )
}
