import { useState } from 'react'
import { act, useUi } from '../lib/store'
import { Btn, Field, Led, Panel } from '../lib/ui'
import { GRAPHICS_ROLES } from '../../shared/types'

const STEPS = ['Welcome', 'Production', 'OBS', 'Graphics', 'Templates', 'Cameras', 'Venue', 'Sport', 'Test', 'Finished']

export default function Setup() {
  const s = useUi((z) => z.s)!
  const setPage = useUi((z) => z.setPage)
  const [step, setStep] = useState(0)
  const save = (p: Partial<typeof s.settings>) => act('settings.save', { ...s.settings, ...p })

  const next = () => setStep((n) => Math.min(n + 1, STEPS.length - 1))
  const back = () => setStep((n) => Math.max(n - 1, 0))
  const finish = () => {
    void act('settings.save', { ...s.settings, setupComplete: true })
    setPage('production')
  }

  const requiredRoles = ['scoreboard', 'lowerThird', 'playerIntro', 'sponsor', 'fullscreen'] as const
  const camsOnline = s.cameras.filter((c) => c.online).length

  return (
    <div className="h-full grid place-items-center p-6 bg-[#0d0f12]">
      <div className="w-full max-w-2xl">
        <ol className="flex gap-1 mb-4" aria-label="Setup progress">
          {STEPS.map((label, i) => (
            <li key={label} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-sky-400' : 'bg-edge'}`} title={label} />
          ))}
        </ol>

        <Panel title={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}>
          <div className="min-h-[280px]">
            {step === 0 && (
              <div className="space-y-3">
                <h2 className="text-2xl font-bold uppercase tracking-wide">
                  {s.settings.setupComplete ? 'Check your production system' : 'Welcome to Sports Broadcast Control'}
                </h2>
                <p className="text-zinc-400">
                  This app is the control surface for your broadcast. OBS Studio produces and streams the video; CasparCG renders the
                  graphics. Nothing here replaces them — it drives them from one place.
                </p>
                <p className="text-zinc-400">
                  You can finish this wizard without any hardware connected: Demo mode gives you mock cameras, a mock OBS and mock
                  graphics so students can practise safely.
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-3">
                <Field label="Production name" value={s.settings.productionName} onChange={(v) => save({ productionName: v })} hint="Shown in the title bar, e.g. Lincoln High Sports Broadcasting." />
                <Field
                  label="Mode" type="select" value={s.settings.demoMode ? 'demo' : 'live'}
                  onChange={(v) => save({ demoMode: v === 'demo' })}
                  options={[{ value: 'demo', label: 'Demo / test — nothing goes to air' }, { value: 'live', label: 'Live production' }]}
                />
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-3">
                <Led state={s.obs.state} label={`OBS ${s.obs.state}`} title={s.obs.detail} />
                <p className="text-xs text-zinc-500">In OBS: Tools → WebSocket Server Settings → Enable, then copy the password here.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Host" value={s.settings.obs.host} onChange={(v) => save({ obs: { ...s.settings.obs, host: v } })} />
                  <Field label="Port" type="number" value={s.settings.obs.port} onChange={(v) => save({ obs: { ...s.settings.obs, port: Number(v) || 4455 } })} />
                </div>
                <Field label="Password" type="password" value={s.settings.obs.password} onChange={(v) => save({ obs: { ...s.settings.obs, password: v } })} />
                <Btn onClick={() => act('obs.connect', { on: true })}>Test connection</Btn>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-3">
                <Led state={s.graphics.state} label={`${s.graphics.engine} — ${s.graphics.state}`} title={s.graphics.detail} />
                <p className="text-xs text-zinc-500">
                  Graphics are rendered by <strong>CasparCG Server</strong> (free, GPLv3). Download it, unzip it, run{' '}
                  <span className="num">casparcg.exe</span>, then point this app at its AMCP port.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Host" value={s.settings.graphics.host} onChange={(v) => save({ graphics: { ...s.settings.graphics, host: v } })} />
                  <Field label="AMCP port" type="number" value={s.settings.graphics.port} onChange={(v) => save({ graphics: { ...s.settings.graphics, port: Number(v) || 5250 } })} />
                  <Field label="Channel" type="number" min={1} value={s.settings.graphics.channel} onChange={(v) => save({ graphics: { ...s.settings.graphics, channel: Number(v) || 1 } })} />
                </div>
                <Field label="Installation folder" value={s.settings.graphics.installPath} onChange={(v) => save({ graphics: { ...s.settings.graphics, installPath: v } })} />
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => act('graphics.connect', { on: true })}>Locate / connect</Btn>
                  <Btn tone="ghost" onClick={() => act('shell.open', { url: 'https://github.com/CasparCG/server/releases' })}>Open setup instructions</Btn>
                  <Btn tone="ghost" onClick={next}>Continue without graphics</Btn>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">
                  {s.graphics.templates.length
                    ? `${s.graphics.templates.length} templates found on the server. Map the ones you want to use.`
                    : 'No templates reported yet. Install a template pack into the CasparCG template folder, then rescan.'}
                </p>
                <ul className="space-y-1 text-sm">
                  {requiredRoles.map((r) => {
                    const m = s.mappings.find((x) => x.role === r)
                    const ok = !!m?.template && (!s.graphics.templates.length || s.graphics.templates.some((t) => t.toUpperCase() === m.template.toUpperCase()))
                    return (
                      <li key={r} className="flex items-center justify-between gap-3 border-b border-edge/50 py-1.5">
                        <span className="capitalize">{r.replace(/([A-Z])/g, ' $1')}</span>
                        <span className={ok ? 'text-preview' : 'text-warn'}>{ok ? '✓ mapped' : '○ not mapped'}</span>
                      </li>
                    )
                  })}
                </ul>
                <div className="flex gap-2">
                  <Btn tone="ghost" onClick={() => act('graphics.refresh')}>Rescan</Btn>
                  <Btn tone="ghost" onClick={() => { setPage('graphics'); }}>Open template mapping</Btn>
                </div>
                <p className="text-[11px] text-zinc-600">{GRAPHICS_ROLES.length} roles are available in total; the rest are optional.</p>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  {s.cameras.length} scene{s.cameras.length === 1 ? '' : 's'} in OBS · {s.ndiSources.length} NDI sources on the network.
                </p>
                <ul className="space-y-1 text-sm">
                  {s.cameras.map((c) => (
                    <li key={c.id} className="flex items-center justify-between border-b border-edge/50 py-1.5">
                      <Led state={c.online === null ? 'off' : c.online ? 'connected' : 'error'} label={c.name} />
                      <span className="text-xs num text-zinc-500 truncate max-w-[60%]">{c.address || 'no health check'}</span>
                    </li>
                  ))}
                </ul>
                <Btn tone="ghost" onClick={() => setPage('sources')}>Open source setup</Btn>
              </div>
            )}

            {step === 6 && (
              <div className="grid gap-3">
                <Field
                  label="Venue" type="select" value={s.settings.activeVenueId}
                  onChange={(v) => act('venue.load', { id: v })}
                  options={s.venues.map((v) => ({ value: v.id, label: v.name }))}
                />
                <p className="text-xs text-zinc-500">Venues store the OBS and graphics addresses, safe scene and mic for each place you broadcast from. Add more under Settings.</p>
              </div>
            )}

            {step === 7 && (
              <Field
                label="Sport" type="select" value={s.settings.activeSport}
                onChange={(v) => act('sport.load', { id: v })}
                options={s.sports.map((x) => ({ value: x.id, label: x.name }))}
                hint="Sets the scoreboard fields, replay defaults, graphics list and checklist."
              />
            )}

            {step === 8 && (
              <ul className="space-y-2">
                <li><Led state={s.obs.state} label="OBS" title={s.obs.detail} /> <span className="text-xs text-zinc-500 ml-2">{s.obs.detail}</span></li>
                <li><Led state={s.graphics.state} label="Graphics" title={s.graphics.detail} /> <span className="text-xs text-zinc-500 ml-2">{s.graphics.detail}</span></li>
                <li><Led state={camsOnline ? 'connected' : 'error'} label="Cameras" /> <span className="text-xs text-zinc-500 ml-2">{camsOnline}/{s.cameras.length} online</span></li>
                <li><Led state={s.settings.api.enabled ? 'connected' : 'off'} label="Control API" /> <span className="text-xs text-zinc-500 ml-2">port {s.settings.api.port}</span></li>
              </ul>
            )}

            {step === 9 && (
              <div className="space-y-3">
                <h2 className="text-2xl font-bold uppercase tracking-wide text-preview">Ready</h2>
                <p className="text-zinc-400">Run the pre-game checklist before every broadcast. The student guide is in <span className="num">docs/student-guide.md</span>.</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-edge">
            <Btn tone="ghost" onClick={back} disabled={step === 0}>Back</Btn>
            <div className="flex-1" />
            {/* On a re-run there is nothing to skip — the button is just the way out. */}
            <Btn tone="ghost" onClick={finish}>{s.settings.setupComplete ? 'Close' : 'Skip setup'}</Btn>
            {step < STEPS.length - 1 ? <Btn tone="go" onClick={next}>Continue</Btn> : <Btn tone="go" onClick={finish}>Start broadcasting</Btn>}
          </div>
        </Panel>
      </div>
    </div>
  )
}
