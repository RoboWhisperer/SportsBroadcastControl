import { useState } from 'react'
import { act, useApp } from '../lib/store'
import { Btn, Field, Panel, useConfirm } from '../lib/ui'
import type { CameraType, SceneOverride } from '../../shared/types'

const TYPES: CameraType[] = ['NDI', 'HDMI_ENCODER', 'PTZ', 'RTSP', 'SRT', 'CUSTOM']

/**
 * Everything OBS currently has: its inputs, what each scene contains, and the
 * per-scene annotations this app layers on top. Nothing here is invented — an
 * empty OBS shows an empty page.
 */
export default function Sources() {
  const s = useApp()
  const { ask, node } = useConfirm()
  const [newSource, setNewSource] = useState({ scene: '', name: '', kind: '' })
  const connected = s.obs.state === 'connected'

  if (!connected) {
    return (
      <Panel title="Sources">
        <p className="text-sm text-zinc-500">
          OBS is not connected, so there is nothing to show. Sources and scenes live in OBS — {s.obs.detail}
        </p>
      </Panel>
    )
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_380px] items-start">
      {node}

      <div className="grid gap-3">
        <Panel
          title={`Scenes and their contents — ${s.obs.scenes.length} in OBS`}
          right={<Btn tone="ghost" className="py-1! px-2! text-[10px]!" onClick={() => act('obs.refresh')}>Refresh</Btn>}
        >
          {!s.obs.scenes.length && (
            <p className="text-sm text-zinc-500">
              OBS has no scenes. Create one below, or build them in OBS — either way this list follows OBS.
            </p>
          )}
          <div className="space-y-3">
            {s.obs.scenes.map((scene) => {
              const items = s.sceneItems[scene] ?? []
              const o = s.sceneOverrides[scene] ?? {}
              const setO = (p: Partial<SceneOverride>) => act('scene.override', { scene, override: { ...o, ...p } })
              return (
                <div key={scene} className="border border-edge rounded-xs p-3 bg-surface">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <SceneName scene={scene} />
                    <div className="flex gap-2">
                      <Btn className="py-1.5! text-xs!" onClick={() => act('obs.setScene', { scene })}>Take</Btn>
                      <Btn
                        tone="ghost" className="py-1.5! text-xs!"
                        onClick={() =>
                          ask('Remove this scene from OBS?', `"${scene}" and its contents are deleted in OBS itself. This cannot be undone from here.`, 'Remove scene', () =>
                            act('scene.remove', { name: scene }),
                          )
                        }
                      >
                        Remove
                      </Btn>
                    </div>
                  </div>

                  <ul className="space-y-1 mb-3">
                    {items.map((it) => (
                      <li key={`${it.group ?? ''}-${it.id}`} className={`flex items-center gap-2 text-sm ${it.group ? 'pl-6' : ''}`}>
                        <button
                          onClick={() => act('source.toggle', { scene: it.group ?? scene, id: it.id, enabled: !it.enabled })}
                          aria-pressed={it.enabled}
                          aria-label={`${it.sourceName} ${it.enabled ? 'visible' : 'hidden'}`}
                          className={`tap min-h-0! px-2 py-1 text-[10px] font-bold tracking-widest rounded-xs border shrink-0
                            ${it.enabled ? 'border-preview/60 bg-preview/15 text-preview' : 'border-edge text-zinc-500'}`}
                        >
                          {it.enabled ? 'ON' : 'OFF'}
                        </button>
                        <span className="truncate">{it.sourceName}</span>
                        {/* A scene can contain another scene; that is not a source. */}
                        {it.type === 'scene' ? (
                          <span className="text-[9px] font-bold tracking-widest px-1 py-0.5 rounded-xs bg-sky-400/20 text-sky-300 shrink-0">
                            NESTED SCENE
                          </span>
                        ) : it.type === 'group' ? (
                          <span className="text-[9px] font-bold tracking-widest px-1 py-0.5 rounded-xs bg-warn/20 text-warn shrink-0">GROUP</span>
                        ) : (
                          <span className="text-[10px] num text-zinc-600 truncate">{it.kind}</span>
                        )}
                      </li>
                    ))}
                    {!items.length && <li className="text-xs text-zinc-600">No sources in this scene.</li>}
                  </ul>

                  <div className="grid gap-3 sm:grid-cols-4 border-t border-edge/60 pt-3">
                    <Field label="Label in app" value={o.label ?? ''} onChange={(v) => setO({ label: v })} hint="Blank = the OBS name." />
                    <Field
                      label="On Production" type="select" value={o.hidden ? 'no' : 'yes'}
                      onChange={(v) => setO({ hidden: v === 'no' })}
                      options={[{ value: 'yes', label: 'Show as camera' }, { value: 'no', label: 'Hide' }]}
                    />
                    <Field
                      label="Device type" type="select" value={o.type ?? ''}
                      onChange={(v) => setO({ type: (v || undefined) as CameraType })}
                      options={[{ value: '', label: '— none —' }, ...TYPES.map((t) => ({ value: t, label: t }))]}
                    />
                    <Field
                      label="Health check address" value={o.address ?? ''} onChange={(v) => setO({ address: v })}
                      hint="Optional. host:port, rtsp:// URL, or an NDI source name."
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel title={`Sources in OBS — ${s.inputs.length}`} right={<span className="text-[10px] text-zinc-500">scenes are not sources and are not listed here</span>}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {s.inputs.map((i) => {
              const usedIn = Object.entries(s.sceneItems)
                .filter(([, items]) => items.some((it) => it.type !== 'scene' && it.sourceName === i.name))
                .map(([scene]) => scene)
              return (
              <li key={i.name} className="flex items-center gap-2 border border-edge rounded-xs px-3 py-2 bg-surface">
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm">{i.name}</span>
                  <span className="block text-[10px] text-zinc-600 truncate">
                    {usedIn.length ? `in ${usedIn.join(', ')}` : 'not used in any scene'}
                  </span>
                </span>
                <span className="text-[10px] num text-zinc-500 truncate max-w-[35%]">{i.kind}</span>
                <Btn
                  tone="ghost" className="py-1! px-2! text-[10px]!"
                  onClick={() =>
                    ask('Remove this source from OBS?', `"${i.name}" is deleted in OBS and disappears from every scene using it.`, 'Remove source', () =>
                      act('source.remove', { name: i.name }),
                    )
                  }
                >
                  ✕
                </Btn>
              </li>
              )
            })}
            {!s.inputs.length && <li className="text-sm text-zinc-500">OBS has no sources.</li>}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3">
        <NewScene />

        <Panel title="Add a source to OBS">
          <div className="grid gap-3">
            <Field
              label="Into scene" type="select" value={newSource.scene}
              onChange={(v) => setNewSource((x) => ({ ...x, scene: v }))}
              options={[{ value: '', label: '— pick a scene —' }, ...s.obs.scenes.map((x) => ({ value: x, label: x }))]}
            />
            <Field label="Name" value={newSource.name} onChange={(v) => setNewSource((x) => ({ ...x, name: v }))} />
            <Field
              label="Kind" type="select" value={newSource.kind}
              onChange={(v) => setNewSource((x) => ({ ...x, kind: v }))}
              options={[{ value: '', label: '— pick a kind —' }, ...s.inputKinds.map((k) => ({ value: k, label: k }))]}
              hint="Only kinds this OBS build reports are offered."
            />
            <Btn
              tone="go"
              disabled={!newSource.scene || !newSource.name || !newSource.kind}
              onClick={() => {
                void act('source.create', newSource)
                setNewSource({ scene: '', name: '', kind: '' })
              }}
            >
              Create in OBS
            </Btn>
          </div>
        </Panel>

        <Panel title={`Discovered NDI sources (${s.ndiSources.length})`}>
          <p className="text-xs text-zinc-400 mb-2">
            Seen on the network. They are not in OBS until you add them there — this list is for filling in a health-check address.
          </p>
          <ul className="space-y-1 text-xs num">
            {s.ndiSources.map((n) => <li key={n} className="truncate">{n}</li>)}
            {!s.ndiSources.length && (
              <li className="text-zinc-500">{s.settings.ndi.discovery ? 'Nothing found on this subnet.' : 'Discovery is off in Settings.'}</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

/** Renames the scene in OBS itself, so the change is visible everywhere. */
function SceneName({ scene }: { scene: string }) {
  const s = useApp()
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-bold uppercase tracking-wide truncate">{scene}</span>
        <button className="tap min-h-0! px-1 text-[10px] text-zinc-500 hover:text-zinc-200" onClick={() => setDraft(scene)}>
          rename
        </button>
      </span>
    )
  }
  const clash = draft.trim() !== scene && s.obs.scenes.includes(draft.trim())
  const commit = () => {
    const name = draft.trim()
    if (name && name !== scene && !clash) void act('scene.rename', { name: scene, newName: name })
    setDraft(null)
  }
  return (
    <span className="flex items-center gap-2 min-w-0 flex-1">
      <input
        autoFocus
        className="tap min-h-0! flex-1 bg-[#0d0f12] border border-edge rounded-xs px-2 py-1 text-sm focus:border-sky-400"
        aria-label={`New name for scene ${scene}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(null)
        }}
      />
      <Btn className="py-1! px-2! text-[10px]!" disabled={clash || !draft.trim()} onClick={commit}>Apply</Btn>
      <Btn tone="ghost" className="py-1! px-2! text-[10px]!" onClick={() => setDraft(null)}>Cancel</Btn>
    </span>
  )
}

function NewScene() {
  const s = useApp()
  const [name, setName] = useState('')
  const exists = s.obs.scenes.includes(name.trim())
  return (
    <Panel title="Add a scene to OBS">
      <div className="grid gap-3">
        <Field label="Scene name" value={name} onChange={setName} />
        <Btn
          tone="go"
          disabled={!name.trim() || exists}
          onClick={() => {
            void act('scene.create', { name: name.trim() })
            setName('')
          }}
        >
          Create in OBS
        </Btn>
        {exists && <p className="text-[11px] text-warn">OBS already has a scene called {name.trim()}.</p>}
      </div>
    </Panel>
  )
}
