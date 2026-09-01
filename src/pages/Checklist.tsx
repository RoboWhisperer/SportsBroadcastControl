import { useState } from 'react'
import { act, useApp } from '../lib/store'
import { Btn, Panel } from '../lib/ui'

export default function Checklist() {
  const s = useApp()
  const [draft, setDraft] = useState('')
  const venue = s.venues.find((v) => v.id === s.settings.activeVenueId)
  const done = s.checklist.filter((c) => c.done).length
  const profile = s.sports.find((x) => x.id === s.settings.activeSport)

  return (
    <Panel
      title={`Pre-game checklist — ${profile?.name ?? 'Generic'} at ${venue?.name ?? 'venue'}`}
      right={
        <div className="flex items-center gap-3">
          <span className="text-xs num text-zinc-400">{done}/{s.checklist.length}</span>
          <Btn tone="ghost" className="py-1! px-2! text-[10px]!" onClick={() => act('checklist.save', s.checklist.map((c) => ({ ...c, done: false })))}>
            Reset
          </Btn>
        </div>
      }
    >
      <ul className="grid gap-2 lg:grid-cols-2">
        {s.checklist.map((c) => (
          <li key={c.id}>
            <button
              disabled={!!c.auto}
              onClick={() => act('checklist.save', s.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
              className={`tap w-full flex items-center gap-3 px-3 py-3 text-left rounded-xs border transition-colors
                ${c.done ? 'border-preview/60 bg-preview/10' : 'border-edge bg-surface hover:bg-edge'}
                ${c.auto ? 'cursor-default' : ''}`}
            >
              <span aria-hidden className={`text-lg leading-none ${c.done ? 'text-preview' : 'text-zinc-600'}`}>{c.done ? '☑' : '☐'}</span>
              <span className="flex-1">{c.label}</span>
              {c.auto && <span className="text-[10px] uppercase tracking-widest text-zinc-500">auto</span>}
              <span className="sr-only">{c.done ? 'complete' : 'not complete'}</span>
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const label = draft.trim()
          if (!label) return
          act('checklist.save', [...s.checklist, { id: `u${Date.now()}`, label, done: false }])
          setDraft('')
        }}
      >
        <input
          className="tap flex-1 bg-[#0d0f12] border border-edge rounded-xs px-3 py-2 text-sm focus:border-sky-400"
          placeholder="Add a step for this sport and venue…"
          aria-label="New checklist step"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Btn type="submit" disabled={!draft.trim()}>Add</Btn>
      </form>

      <div className="mt-3 space-y-1">
        {s.checklist.filter((c) => !c.auto).length > 0 && (
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer tap py-2">Remove a step</summary>
            <ul className="flex flex-wrap gap-2 mt-2">
              {s.checklist.filter((c) => !c.auto).map((c) => (
                <li key={c.id}>
                  <Btn
                    tone="ghost" className="py-1! px-2! text-[10px]!"
                    onClick={() => act('checklist.save', s.checklist.filter((x) => x.id !== c.id))}
                  >
                    ✕ {c.label}
                  </Btn>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-xs text-zinc-500">
          Rows marked <span className="uppercase tracking-widest">auto</span> follow live system status and cannot be ticked by hand.
          This list is saved for <strong>{profile?.name}</strong> at <strong>{venue?.name}</strong>; other combinations keep their own.
        </p>
      </div>
    </Panel>
  )
}
