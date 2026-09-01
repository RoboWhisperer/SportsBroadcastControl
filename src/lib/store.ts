import { create } from 'zustand'
import type { AppState } from '../../shared/types'
import { mergeCold, mergeHot, type Cold, type Hot } from './merge'

export type Page =
  | 'production' | 'scenes' | 'sources' | 'replay' | 'scoreboard' | 'graphics'
  | 'audio' | 'checklist' | 'monitoring' | 'settings' | 'setup'

declare global {
  interface Window {
    sbc: {
      invoke: (action: string, payload?: unknown) => Promise<unknown>
      onState: (cb: (s: Hot) => void) => () => void
      onCold: (cb: (c: Cold) => void) => () => void
      onThumbs: (cb: (t: Record<string, string>) => void) => () => void
    }
  }
}

export const act = (action: string, payload?: unknown) =>
  window.sbc.invoke(action, payload).catch(() => undefined)

interface UiStore {
  s: AppState | null
  /** Scene name -> data URI, updated on its own channel. */
  thumbs: Record<string, string>
  page: Page
  setPage: (p: Page) => void
}

export const useUi = create<UiStore>((set) => ({
  s: null,
  thumbs: {},
  page: (location.hash.slice(1) as Page) || 'production',
  setPage: (page) => {
    history.replaceState(null, '', `#${page}`)
    set({ page })
  },
}))

window.sbc?.onThumbs((thumbs) => useUi.setState({ thumbs }))

// Logs and sport profiles arrive separately and are merged back in, so pages
// keep reading one AppState and know nothing about the split.
window.sbc?.onCold((cold) => useUi.setState((prev) => ({ s: mergeCold(prev.s, cold) })))

window.sbc?.onState((hot) => {
  useUi.setState((prev) => {
    const s = mergeHot(prev.s, hot)
    // First state push decides whether the operator sees the setup wizard.
    if (!prev.s && !s.settings.setupComplete && !location.hash) return { s, page: 'setup' }
    return { s }
  })
})

/** Pages that display scene stills. Anywhere else, capturing them is wasted work. */
const PAGES_WITH_STILLS: Page[] = ['production', 'scenes']

/**
 * Tell the main process whether this window needs scene stills. Capturing them
 * is the app's only continuous background cost, so it is switched off whenever
 * the window is hidden or the open page shows no pictures.
 */
function reportThumbDemand() {
  const { page } = useUi.getState()
  const want = !document.hidden && PAGES_WITH_STILLS.includes(page)
  void act('ui.thumbs', { want })
}
useUi.subscribe(reportThumbDemand)
document.addEventListener('visibilitychange', reportThumbDemand)
reportThumbDemand()

/** Convenience hook: state is guaranteed non-null inside the app shell. */
export const useApp = () => useUi((z) => z.s) as AppState
