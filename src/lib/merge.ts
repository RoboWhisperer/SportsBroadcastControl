import type { AppState } from '../../shared/types'

/** Slices kept off the hot channel because they are large and rarely change. */
export type Cold = Pick<AppState, 'logs' | 'sports'>
export type Hot = Omit<AppState, 'logs' | 'sports'>

/**
 * The renderer receives the application state on two channels and reassembles
 * it, so every page keeps reading one `AppState` and knows nothing about the
 * split. The two can arrive in either order, and either can arrive first.
 */
export function mergeHot(prev: AppState | null, hot: Hot): AppState {
  return { logs: [], sports: [], ...prev, ...hot }
}

export function mergeCold(prev: AppState | null, cold: Cold): AppState {
  return { ...(prev ?? ({} as AppState)), ...cold }
}
