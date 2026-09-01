import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ConnState } from '../../shared/types'

const TONE = {
  neutral: 'bg-surface hover:bg-edge border-edge text-zinc-100',
  live: 'bg-live/90 hover:bg-live border-red-400 text-white',
  go: 'bg-preview/90 hover:bg-preview border-emerald-300 text-black',
  warn: 'bg-warn/90 hover:bg-warn border-amber-300 text-black',
  ghost: 'bg-transparent hover:bg-surface border-edge text-zinc-300',
} as const
export type Tone = keyof typeof TONE

export function Btn({
  children, onClick, tone = 'neutral', active, disabled, className = '', title, big, type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  tone?: Tone
  active?: boolean
  disabled?: boolean
  className?: string
  title?: string
  big?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`tap border font-semibold uppercase tracking-wide rounded-xs transition-colors
        ${big ? 'text-lg px-6 py-5' : 'text-sm px-4 py-3'}
        ${TONE[tone]}
        ${active ? 'ring-2 ring-inset ring-white/80' : ''}
        disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  )
}

const LED_COLOR: Record<ConnState | 'live' | 'off', string> = {
  connected: 'bg-preview',
  connecting: 'bg-warn animate-pulse',
  error: 'bg-live',
  disconnected: 'bg-idle',
  live: 'bg-live',
  off: 'bg-idle',
}
/** Status dot with a text label — colour is never the only signal (WCAG 1.4.1). */
export function Led({ state, label, title }: { state: ConnState | 'live' | 'off'; label: string; title?: string }) {
  const shape = state === 'connected' || state === 'live' ? '●' : state === 'error' ? '▲' : state === 'connecting' ? '◐' : '○'
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={title ?? label}>
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${LED_COLOR[state]}`} aria-hidden />
      <span className="sr-only">{state}</span>
      <span aria-hidden className="text-[10px] leading-none opacity-70">{shape}</span>
      <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
    </span>
  )
}

export function Panel({ title, children, right, className = '' }: { title?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`bg-panel border border-edge rounded-xs flex flex-col min-h-0 ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-3 py-2 border-b border-edge shrink-0">
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-400">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-3 flex-1 min-h-0 overflow-auto">{children}</div>
    </section>
  )
}

export function Field({
  label, value, onChange, type = 'text', options, hint, min, max, disabled,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: 'text' | 'number' | 'password' | 'select' | 'color'
  options?: { value: string; label: string }[]
  hint?: string
  min?: number
  max?: number
  disabled?: boolean
}) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`
  const cls = 'tap w-full bg-[#0d0f12] border border-edge rounded-xs px-3 py-2 text-base num focus:border-sky-400 disabled:opacity-50'
  // Callers coerce number input (`Number(v) || 4455`), which would rewrite the box
  // out from under anyone mid-edit. While focused, show exactly what was typed.
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const shown = type === 'number' && editing ? draft : String(value)
  return (
    <label htmlFor={id} className="block">
      <span className="block text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-1">{label}</span>
      {type === 'select' ? (
        <select id={id} className={cls} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={id} className={cls} type={type} value={shown} min={min} max={max} disabled={disabled}
          onFocus={() => {
            setDraft(String(value))
            setEditing(true)
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            setDraft(e.target.value)
            onChange(e.target.value)
          }}
        />
      )}
      {hint && <span className="block text-[11px] text-zinc-500 mt-1">{hint}</span>}
    </label>
  )
}

/** Two-step confirmation for anything that would interrupt a live broadcast. */
export function Confirm({
  open, title, body, confirmLabel, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])
  if (!open) return null
  return (
    <div
      role="alertdialog" aria-modal aria-label={title}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div className="bg-panel border-2 border-live rounded-xs max-w-md w-full p-6">
        <h2 className="text-xl font-bold uppercase tracking-wide text-live">{title}</h2>
        <p className="mt-3 text-zinc-300">{body}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Btn tone="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn tone="live" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  )
}

/** Confirmation state for a destructive action, kept out of every caller. */
export function useConfirm() {
  const [pending, setPending] = useState<{ title: string; body: string; confirmLabel: string; run: () => void } | null>(null)
  return {
    ask: (title: string, body: string, confirmLabel: string, run: () => void) => setPending({ title, body, confirmLabel, run }),
    node: (
      <Confirm
        open={!!pending}
        title={pending?.title ?? ''}
        body={pending?.body ?? ''}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          pending?.run()
          setPending(null)
        }}
      />
    ),
  }
}

export const hhmmss = (sec: number) =>
  [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':')
