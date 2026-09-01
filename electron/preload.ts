import { contextBridge, ipcRenderer } from 'electron'
import type { AppState } from '../shared/types.js'

const api = {
  /** Every UI command goes through one channel; the Hub owns the action list. */
  invoke: (action: string, payload?: unknown) => ipcRenderer.invoke('sbc:action', action, payload) as Promise<unknown>,
  onState: (cb: (s: AppState) => void) => {
    const h = (_e: unknown, s: AppState) => cb(s)
    ipcRenderer.on('sbc:state', h)
    return () => ipcRenderer.off('sbc:state', h)
  },
  /** Logs and sport profiles: large, rarely changed, kept out of the hot snapshot. */
  onCold: (cb: (c: Pick<AppState, 'logs' | 'sports'>) => void) => {
    const h = (_e: unknown, c: Pick<AppState, 'logs' | 'sports'>) => cb(c)
    ipcRenderer.on('sbc:cold', h)
    return () => ipcRenderer.off('sbc:cold', h)
  },
  /** Separate channel: scene thumbnails must not ride in the state snapshot. */
  onThumbs: (cb: (t: Record<string, string>) => void) => {
    const h = (_e: unknown, t: Record<string, string>) => cb(t)
    ipcRenderer.on('sbc:thumbs', h)
    return () => ipcRenderer.off('sbc:thumbs', h)
  },
}

contextBridge.exposeInMainWorld('sbc', api)
export type SbcApi = typeof api
