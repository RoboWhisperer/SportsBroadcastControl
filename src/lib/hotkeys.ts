import { useEffect } from 'react'
import { act } from './store'
import { comboOf } from './keys'
import type { AppState, GraphicsRole } from '../../shared/types'

/**
 * Run a hotkey command. Commands that would interrupt a broadcast (stopping the
 * stream) are deliberately absent - those need the on-screen confirmation.
 */
export function runCommand(cmd: string, s: AppState) {
  const [group, arg] = cmd.split(':')
  switch (group) {
    case 'camera': {
      // A number means "the nth shot OBS is offering", so the default 1-4
      // bindings work without naming scenes that may not exist. Anything else
      // is taken as a scene name.
      const id = /^\d+$/.test(arg) ? s.cameras[Number(arg) - 1]?.id : arg
      return id ? act('camera.take', { id }) : undefined
    }
    case 'scene':
      return act('obs.setScene', { scene: arg })
    case 'obs':
      if (arg === 'transition') return act('obs.transition')
      if (arg === 'studio') return act('obs.studioMode', { on: !s.obs.studioMode })
      return
    case 'replay':
      if (arg === 'last') return act('replay.last', { seconds: s.settings.replay.defaultDuration, speed: 100 })
      if (arg === 'slow') return act('replay.last', { seconds: s.settings.replay.defaultDuration, speed: s.settings.replay.defaultSpeed })
      if (arg === 'live') return act('replay.live')
      if (arg === 'save') return act('replay.save')
      return
    case 'graphics':
      if (arg === 'clear') return act('graphics.clear')
      return act('graphics.play', { role: arg as GraphicsRole })
    case 'record':
      return act('record.set', { on: !s.obs.recording })
    case 'stream':
      // Only starting is hotkeyable; stopping a live stream requires confirmation.
      return arg === 'start' && !s.obs.streaming ? act('stream.set', { on: true }) : undefined
    case 'emergency':
      return act(arg === 'mute' ? 'emergency.mute' : 'emergency.safe')
    default:
      return
  }
}

export function useHotkeys(s: AppState | null) {
  useEffect(() => {
    if (!s) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const cmd = s.settings.hotkeys[comboOf(e)]
      if (!cmd) return
      e.preventDefault()
      void runCommand(cmd, s)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s])
}
