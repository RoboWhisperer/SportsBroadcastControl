/** Turn a keydown into the string used as a key in `settings.hotkeys`. */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  parts.push(parts.length && key.length === 1 ? key.toUpperCase() : key)
  return parts.join('+')
}
