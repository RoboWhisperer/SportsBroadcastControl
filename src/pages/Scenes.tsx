import { act, useApp, useUi } from '../lib/store'
import { Btn, Panel } from '../lib/ui'

/**
 * Every scene in the OBS collection, with the picture OBS reports for it.
 * Clicking a scene asks OBS to switch — in Studio Mode it loads preview and the
 * cut waits for TAKE. Creating and arranging scenes stays in OBS.
 */
export default function Scenes() {
  const s = useApp()
  const thumbs = useUi((z) => z.thumbs)
  const studio = s.obs.studioMode

  if (s.obs.state !== 'connected') {
    return (
      <Panel title="Scenes">
        <p className="text-sm text-zinc-500">OBS is not connected — scenes are owned by OBS. {s.obs.detail}</p>
      </Panel>
    )
  }

  return (
    <Panel
      title={`Scenes — ${s.obs.scenes.length} in this collection`}
      right={
        <div className="flex items-center gap-3">
          <Btn
            tone={studio ? 'go' : 'ghost'}
            active={studio}
            className="py-1! px-2! text-[10px]!"
            onClick={() => act('obs.studioMode', { on: !studio })}
          >
            Studio mode {studio ? 'on' : 'off'}
          </Btn>
          {studio && (
            <Btn tone="live" className="py-1! px-3! text-[10px]!" disabled={!s.obs.previewScene} onClick={() => act('obs.transition')}>
              Take ⏎
            </Btn>
          )}
        </div>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {s.obs.scenes.map((name) => {
          const onProgram = s.obs.currentScene === name
          const onPreview = studio && s.obs.previewScene === name
          const thumb = thumbs[name]
          return (
            <button
              key={name}
              onClick={() => act(studio ? 'obs.setPreview' : 'obs.setScene', { scene: name })}
              aria-pressed={onProgram}
              aria-label={`${name}${onProgram ? ', on program' : onPreview ? ', on preview' : ''}`}
              className={`tap text-left rounded-xs border-2 overflow-hidden transition-colors
                ${onProgram ? 'border-live bg-live/20' : onPreview ? 'border-preview bg-preview/15' : 'border-edge bg-surface hover:bg-edge'}`}
            >
              <div className="relative aspect-video bg-black">
                {thumb ? (
                  <img src={thumb} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="grid place-items-center h-full text-[10px] uppercase tracking-[0.2em] text-zinc-600">waiting…</div>
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
              <p className="px-2 py-2 text-sm font-semibold uppercase tracking-wide truncate">{name}</p>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Pictures come from OBS. Add, remove and arrange scenes in OBS — this page switches between them.
      </p>
    </Panel>
  )
}
