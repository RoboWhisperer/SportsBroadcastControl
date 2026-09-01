import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

/**
 * This app is a remote control. It asks OBS for pictures with GetSourceScreenshot;
 * it must never open a camera, a screen or a window itself. Doing so makes the OS
 * raise a capture prompt ("Share Screen"), which is not acceptable in a control
 * surface a student runs during a live broadcast.
 */
const FORBIDDEN = [
  'getUserMedia',
  'getDisplayMedia',
  'enumerateDevices',
  'desktopCapturer',
  'mediaDevices',
  'navigator.permissions',
]

describe('the app never acquires media itself', () => {
  const files = ['electron', 'src', 'shared']
    .flatMap((d) => walk(path.join(ROOT, d)))
    .filter((f) => /\.(ts|tsx)$/.test(f))

  it.each(FORBIDDEN)('never calls %s', (api) => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(api))
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('asks OBS for pictures instead', () => {
    const obs = readFileSync(path.join(ROOT, 'electron/services/obs.ts'), 'utf8')
    expect(obs).toContain('GetSourceScreenshot')
  })

  it('denies every permission request so no OS prompt can appear', () => {
    const main = readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf8')
    expect(main).toContain('setPermissionRequestHandler')
    expect(main).toMatch(/setPermissionRequestHandler\([\s\S]*?callback\(false\)/)
    expect(main).toContain('setDisplayMediaRequestHandler')
  })

  it('declares no camera or display permission in the packaged app', () => {
    const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    expect(html).not.toMatch(/camera|microphone|display-capture/i)
  })
})

/**
 * Reported from a real run: closing the app threw
 * `TypeError: Object has been destroyed` from a BrowserWindow handler. By the
 * time 'closed' fires the window and its webContents are gone, so any handler
 * that reaches for them crashes on every shutdown.
 */
describe('window teardown', () => {
  const main = readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf8')
  const closedHandler = /win\.on\('closed',\s*\(\)\s*=>\s*\{([^}]*)\}/.exec(main)?.[1] ?? ''

  it('has a closed handler', () => {
    expect(closedHandler.trim()).not.toBe('')
  })

  it('never touches the window or its webContents after it is destroyed', () => {
    expect(closedHandler).not.toMatch(/win\.webContents/)
    expect(closedHandler).not.toMatch(/win\.get/)
    expect(closedHandler).not.toMatch(/win\.is/)
  })

  it('captures the window id up front so teardown needs nothing live', () => {
    expect(main).toMatch(/const winId = String\(win\.webContents\.id\)/)
  })

  it('keeps the app alive when the main process throws', () => {
    expect(main).toMatch(/process\.on\('uncaughtException'/)
    expect(main).toMatch(/process\.on\('unhandledRejection'/)
  })
})

/** Chromium's Vulkan path is unsupported under Wayland and warns on every start. */
describe('startup switches', () => {
  const main = readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf8')

  it('drops hardware acceleration on Wayland, which is the only thing that silences the Vulkan error', () => {
    // Verified empirically on Electron 44: disable-features=Vulkan,
    // DefaultANGLEVulkan,VulkanFromANGLE and --use-angle=gl all still log it.
    expect(main).toMatch(/const waylandSession =/)
    expect(main).toMatch(/XDG_SESSION_TYPE === 'wayland' \|\| !!process\.env\.WAYLAND_DISPLAY/)
    expect(main).toMatch(/if \(waylandSession && !app\.commandLine\.hasSwitch\('enable-gpu'\)\) app\.disableHardwareAcceleration\(\)/)
  })

  it('leaves Windows and X11 on the GPU, where the message never appears', () => {
    const guard = /const waylandSession =[\s\S]*?disableHardwareAcceleration\(\)/.exec(main)?.[0] ?? ''
    expect(guard).toMatch(/process\.platform === 'linux'/)
  })

  it('sets switches before the app is ready, or they are ignored', () => {
    expect(main.indexOf("appendSwitch(\n  'disable-features'")).toBeLessThan(main.indexOf('app.whenReady()'))
  })
})
