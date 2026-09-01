import type { Settings } from '../../shared/types'

/**
 * Student mode and every non-admin role hide the Settings page — which is the
 * only place to turn them off again. Without a way back, choosing one is a
 * one-way door that can only be undone by editing the database, so the shell
 * always renders an escape control while this is true.
 */
export function isRestricted(s: Settings) {
  return s.studentMode || s.role !== 'admin'
}

/** What the escape control applies: full access, nothing else touched. */
export function unlocked(s: Settings): Settings {
  return { ...s, studentMode: false, role: 'admin' }
}
