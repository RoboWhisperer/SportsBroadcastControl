import { useState } from 'react'
import { act, useApp } from '../lib/store'
import { Btn, Field, Led, Panel } from '../lib/ui'
import type { GraphicsRole, TemplateMapping } from '../../shared/types'

const ROLE_LABEL: Record<GraphicsRole, string> = {
  scoreboard: 'Scoreboard',
  lowerThird: 'Lower Third',
  playerIntro: 'Player Intro',
  startingLineup: 'Starting Lineup',
  coach: 'Coach',
  sponsor: 'Sponsor',
  fullscreen: 'Fullscreen',
  halftime: 'Halftime',
  final: 'Final',
  firstDown: 'First Down',
  touchdown: 'Touchdown',
}

/** Data-entry fields offered for each role. Scoreboard is filled from game state. */
const ROLE_FIELDS: Partial<Record<GraphicsRole, string[]>> = {
  lowerThird: ['line1', 'line2'],
  playerIntro: ['name', 'number', 'position', 'year'],
  startingLineup: ['title', 'line1', 'line2', 'line3', 'line4', 'line5'],
  coach: ['name', 'title'],
  sponsor: ['name', 'message'],
  fullscreen: ['title', 'subtitle'],
  halftime: ['title'],
  final: ['title'],
  firstDown: ['title'],
  touchdown: ['title'],
}

export default function Graphics() {
  const s = useApp()
  const profile = s.sports.find((x) => x.id === s.settings.activeSport) ?? s.sports[0]
  const [selected, setSelected] = useState<GraphicsRole>(profile.graphics[0] ?? 'scoreboard')
  const [data, setData] = useState<Record<string, string>>({})
  const [showMapping, setShowMapping] = useState(false)

  const mapping = s.mappings.find((m) => m.role === selected)
  const installed = !mapping?.template
    ? 'unmapped'
    : s.graphics.templates.length && !s.graphics.templates.some((t) => t.toUpperCase() === mapping.template.toUpperCase())
      ? 'missing'
      : 'ok'
  const fields = ROLE_FIELDS[selected] ?? []
  const offline = s.graphics.state !== 'connected'

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_380px] items-start">
      <div className="grid gap-3">
        <Panel
          title={`${s.graphics.engine} — templates`}
          right={
            <div className="flex items-center gap-3">
              <Led state={s.graphics.state} label={s.graphics.state} title={s.graphics.detail} />
              <Btn tone="ghost" className="py-1! px-2! text-[10px]!" onClick={() => act('graphics.refresh')}>Rescan</Btn>
              <Btn tone="ghost" className="py-1! px-2! text-[10px]!" onClick={() => setShowMapping((v) => !v)}>
                {showMapping ? 'Hide mapping' : 'Template mapping'}
              </Btn>
            </div>
          }
        >
          {offline && (
            <p className="mb-3 px-3 py-2 border-l-4 border-live bg-live/15 text-sm">
              ⚠ Graphics server offline — {s.graphics.detail}. Nothing will reach air until it reconnects.
            </p>
          )}
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {profile.graphics.map((role) => {
              const m = s.mappings.find((x) => x.role === role)
              const onAir = s.graphics.onAir.includes(role)
              return (
                <button
                  key={role}
                  onClick={() => { setSelected(role); setData({}) }}
                  aria-pressed={selected === role}
                  className={`tap p-3 text-left rounded-xs border-2 transition-colors
                    ${onAir ? 'border-live bg-live/25' : selected === role ? 'border-sky-400 bg-surface' : 'border-edge bg-surface hover:bg-edge'}`}
                >
                  <span className="block font-bold uppercase text-sm tracking-wide">{ROLE_LABEL[role]}</span>
                  <span className="block text-[10px] num truncate text-zinc-500 mt-1">{m?.template || 'not mapped'}</span>
                  {onAir && <span className="block text-[10px] font-bold text-live mt-1">● ON AIR</span>}
                </button>
              )
            })}
          </div>
        </Panel>

        {showMapping && <Mapping />}
      </div>

      <Panel title={ROLE_LABEL[selected]}>
        {installed === 'unmapped' && (
          <p className="mb-3 px-3 py-2 border-l-4 border-warn bg-warn/15 text-sm">
            Template unavailable. Install or select a compatible template package, then map it under Template mapping.
            See <span className="num">docs/templates.md</span>.
          </p>
        )}
        {installed === 'missing' && (
          <p className="mb-3 px-3 py-2 border-l-4 border-live bg-live/15 text-sm">
            ⚠ Mapped template <span className="num">{mapping?.template}</span> is not installed on the graphics server.
          </p>
        )}

        {selected === 'scoreboard' ? (
          <p className="text-sm text-zinc-400">Scoreboard fields come from the Scoreboard page and update live.</p>
        ) : (
          <div className="grid gap-3">
            {fields.map((f) => (
              <Field key={f} label={f} value={data[f] ?? ''} onChange={(v) => setData((d) => ({ ...d, [f]: v }))} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Btn big tone="go" disabled={offline || installed !== 'ok'} onClick={() => act('graphics.play', { role: selected, data })}>
            Take live
          </Btn>
          <Btn big tone="live" disabled={offline} onClick={() => act('graphics.stop', { role: selected })}>Clear</Btn>
        </div>
        <Btn tone="warn" className="w-full mt-2" disabled={offline} onClick={() => act('graphics.clear')}>Clear all layers</Btn>
      </Panel>
    </div>
  )
}

function Mapping() {
  const s = useApp()
  const patch = (role: string, p: Partial<TemplateMapping>) =>
    act('mappings.save', s.mappings.map((m) => (m.role === role ? { ...m, ...p } : m)))

  return (
    <Panel title="Template mapping" right={<span className="text-[10px] text-zinc-500 num">{s.graphics.templates.length} templates on server</span>}>
      <p className="text-xs text-zinc-400 mb-3">
        Point each graphic this app knows about at a template installed on your graphics server. Layers must differ so graphics can stack.
      </p>
      <div className="space-y-2">
        {s.mappings.map((m) => (
          <div key={m.role} className="grid gap-2 sm:grid-cols-[140px_1fr_90px_110px] items-end">
            <span className="text-xs font-bold uppercase tracking-wide text-zinc-300 pb-3">{ROLE_LABEL[m.role]}</span>
            <Field
              label="Template"
              type={s.graphics.templates.length ? 'select' : 'text'}
              value={m.template}
              onChange={(v) => patch(m.role, { template: v })}
              options={[{ value: '', label: '— not mapped —' }, ...s.graphics.templates.map((t) => ({ value: t, label: t }))]}
            />
            <Field label="Layer" type="number" min={1} max={999} value={m.layer} onChange={(v) => patch(m.role, { layer: Number(v) || 1 })} />
            <Field
              label="Data format" type="select" value={m.dataFormat}
              onChange={(v) => patch(m.role, { dataFormat: v as 'xml' | 'json' })}
              options={[{ value: 'xml', label: 'templateData XML' }, { value: 'json', label: 'JSON' }]}
            />
          </div>
        ))}
      </div>
    </Panel>
  )
}
