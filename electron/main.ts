import { app, BrowserWindow, ipcMain, Menu, safeStorage, screen, session, shell, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store, type Crypto } from './db.js'
import { Hub } from './hub.js'
import { ControlApi } from './api.js'
import type { AppState } from '../shared/types.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDERER = path.join(dirname, '../dist')
const DEV_URL = process.env.VITE_DEV_SERVER_URL

let hub: Hub
let api: ControlApi
const windows = new Set<BrowserWindow>()

/**
 * Electron derives the config directory from the package name, so the rename
 * from "school-broadcast-control" to "sports-broadcast-control" would strand an
 * existing installation's venues, template mappings, checklists and game state
 * in the old folder. Copy them across once, and only when the new folder is
 * empty, so this can never overwrite a live configuration.
 */
function adoptPreviousConfig(userData: string) {
  if (existsSync(path.join(userData, 'sbc.db'))) return
  const previous = path.join(path.dirname(userData), 'school-broadcast-control')
  if (!existsSync(path.join(previous, 'sbc.db'))) return
  try {
    mkdirSync(userData, { recursive: true })
    // The WAL and shared-memory files must travel with the database.
    for (const f of readdirSync(previous).filter((n) => n.startsWith('sbc.db'))) {
      copyFileSync(path.join(previous, f), path.join(userData, f))
    }
    console.log(`Adopted configuration from ${previous}`)
  } catch (e) {
    console.error('Could not adopt previous configuration:', e)
  }
}

/** OS-backed secret storage (DPAPI on Windows, Keychain on macOS, libsecret on Linux). */
function makeCrypto(): Crypto | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  return {
    encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
    decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
  }
}

/** Keep a remembered position only if it still lands on a connected display. */
function visibleBounds(b: Electron.Rectangle | undefined) {
  if (!b) return undefined
  const fits = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
  })
  return fits ? b : undefined
}

function createWindow(page?: string, displayIndex = 0) {
  const saved = page ? undefined : visibleBounds(hub.store.getWindowBounds?.())
  const display = screen.getAllDisplays()[displayIndex] ?? screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    ...(saved ?? { width: 1600, height: 950, x: display.bounds.x + 40, y: display.bounds.y + 40 }),
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#0d0f12',
    autoHideMenuBar: true,
    title: 'Sports Broadcast Control',
    webPreferences: {
      preload: path.join(dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  windows.add(win)
  // Captured now: by the time 'closed' fires the window and its webContents are
  // destroyed, and touching either throws "Object has been destroyed".
  const winId = String(win.webContents.id)
  win.on('closed', () => {
    windows.delete(win)
    setThumbDemand(winId, false)
  })
  // A minimised or hidden window needs nothing drawn for it.
  win.on('hide', () => setThumbDemand(winId, false))
  win.on('minimize', () => setThumbDemand(winId, false))
  if (!page) {
    const remember = () => hub.store.saveWindowBounds(win.getNormalBounds())
    win.on('moved', remember)
    win.on('resized', remember)
  }
  // Never let a page navigate itself somewhere else or spawn a browser window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  const hash = page ? `#${page}` : ''
  if (DEV_URL) void win.loadURL(DEV_URL + hash)
  else void win.loadFile(path.join(RENDERER, 'index.html'), { hash: page })
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('sbc:state', hub.state)
    pushColdTo(win)
    win.webContents.send('sbc:thumbs', hub.getThumbnails())
  })
  return win
}

/**
 * The hot snapshot goes out on every change — roughly once a second while OBS
 * is polled. Logs and sport profiles were 89% of its bytes and almost never
 * change, so they ride a separate channel and are sent only when they do.
 * Identity comparison is enough: the hub replaces these arrays, never mutates.
 */
let lastLogs: AppState['logs'] | null = null
let lastSports: AppState['sports'] | null = null

function pushState(state: AppState) {
  const { logs, sports, ...hot } = state
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send('sbc:state', hot)
  if (logs !== lastLogs || sports !== lastSports) {
    lastLogs = logs
    lastSports = sports
    for (const w of windows) if (!w.isDestroyed()) w.webContents.send('sbc:cold', { logs, sports })
  }
}

/** A newly opened window has missed every cold push so far. */
function pushColdTo(win: BrowserWindow) {
  win.webContents.send('sbc:cold', { logs: hub.state.logs, sports: hub.state.sports })
}

function pushThumbs(thumbs: Record<string, string>) {
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send('sbc:thumbs', thumbs)
}

/**
 * Which windows currently want scene stills. Capturing them is the app's only
 * continuous background cost, so it stops when nothing is on screen to show it.
 */
const thumbDemand = new Map<string, boolean>()
function setThumbDemand(id: string, want: boolean) {
  thumbDemand.set(id, want)
  hub.setThumbnailDemand([...thumbDemand.values()].some(Boolean))
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Window',
        submenu: [
          {
            label: 'Open Second Screen (Replay)',
            accelerator: 'CmdOrCtrl+Shift+2',
            click: () => createWindow('replay', 1),
          },
          {
            label: 'Open Second Screen (Graphics)',
            accelerator: 'CmdOrCtrl+Shift+3',
            click: () => createWindow('graphics', 1),
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { role: 'togglefullscreen' },
          { role: 'quit' },
        ],
      },
    ]),
  )
}

const actions: Record<string, (p: any, senderId?: number) => unknown | Promise<unknown>> = {
  'camera.take': (p) => hub.takeCamera(p.id),
  'obs.setScene': (p) => hub.setScene(p.scene),
  'obs.setPreview': (p) => hub.setPreviewScene(p.scene),
  'obs.transition': () => hub.transition(),
  'obs.studioMode': (p) => hub.setStudioMode(p.on),
  'obs.connect': (p) => hub.connectObs(p.on),
  'stream.set': (p) => hub.setStreaming(p.on),
  'record.set': (p) => hub.setRecording(p.on),
  'record.pause': (p) => hub.pauseRecording(p.on),
  'replay.buffer': (p) => hub.setReplayBuffer(p.on),
  'replay.save': () => hub.saveReplay(),
  'replay.last': (p) => hub.replayLast(p.seconds, p.speed),
  'replay.play': () => hub.replayPlay(),
  'replay.live': () => hub.returnToLive(),
  'graphics.play': (p) => hub.graphicsPlay(p.role, p.data ?? {}),
  'graphics.stop': (p) => hub.graphicsStop(p?.role),
  'graphics.clear': () => hub.graphicsClearAll(),
  'graphics.refresh': () => hub.refreshTemplates(),
  'graphics.connect': (p) => hub.connectGraphics(p.on),
  'game.patch': (p) => hub.patchGame(p),
  'game.new': () => hub.startNewGame(),
  'audio.inputs': () => hub.getInputs(),
  'audio.mute': (p) => hub.setMute(p.input, p.muted),
  'emergency.safe': () => hub.safeScene(),
  'emergency.mute': () => hub.muteMic(),
  'settings.save': (p) => hub.saveSettings(p),
  'scene.override': (p) => hub.saveSceneOverride(p.scene, p.override),
  'scene.create': (p) => hub.createScene(p.name),
  'scene.remove': (p) => hub.removeScene(p.name),
  'scene.rename': (p) => hub.renameScene(p.name, p.newName),
  'source.create': (p) => hub.createInput(p.scene, p.name, p.kind, p.settings),
  'source.remove': (p) => hub.removeInput(p.name),
  'source.toggle': (p) => hub.setSceneItemEnabled(p.scene, p.id, p.enabled),
  'obs.refresh': () => hub.refreshInventory(),
  'venues.save': (p) => hub.saveVenues(p),
  'mappings.save': (p) => hub.saveMappings(p),
  'checklist.save': (p) => hub.saveChecklist(p),
  'sport.load': (p) => hub.loadSport(p.id),
  'venue.load': (p) => hub.loadVenue(p.id),
  'alert.dismiss': (p) => hub.dismissAlert(p.id),
  'ui.thumbs': (p, senderId) => setThumbDemand(String(senderId), !!p.want),
  'api.restart': () => api.start(),
  'logs.export': async () => {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `sbc-logs-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    })
    if (!filePath) return { saved: false }
    await writeFile(filePath, hub.exportLogs(), 'utf8')
    return { saved: true, filePath }
  },
  'shell.open': (p) => {
    // Only web links. Never let a URL from the renderer reach the OS handler for
    // file:, javascript: or any custom scheme.
    const url = String(p.url)
    if (!/^https?:\/\//i.test(url)) throw new Error(`Refused to open ${url}`)
    return shell.openExternal(url)
  },
}

// Nothing here browses the web: no translation, no cast discovery, no
// component updates, no autofill or optimisation-hint downloads. Turning them
// off removes background services and their network chatter.
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch(
  'disable-features',
  'Translate,MediaRouter,OptimizationGuideModelDownloading,AutofillServerCommunication,DialMediaRouteProvider',
)

/**
 * Under a Wayland session Chromium's GPU process logs
 * `'--ozone-platform=wayland' is not compatible with Vulkan` on every launch.
 * Measured on Electron 44: no combination of `disable-features` (Vulkan,
 * DefaultANGLEVulkan, VulkanFromANGLE) or `--use-angle=gl` silences it; only
 * dropping hardware acceleration does. That is a good trade here anyway — this
 * UI is flat panels and text, it measured 27 MB smaller without the GPU process
 * pipeline, and it leaves the GPU entirely to OBS, which is the machine's real
 * video workload.
 *
 * Windows and X11 are untouched: they do not produce the message and get GPU
 * acceleration for free. Pass --enable-gpu to override on Wayland.
 */
const waylandSession =
  process.platform === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY)
if (waylandSession && !app.commandLine.hasSwitch('enable-gpu')) app.disableHardwareAcceleration()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = [...windows][0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  // A crash in the main process takes the whole control surface down, possibly
  // mid-game. Log and carry on instead: a degraded app the operator can still
  // cut cameras with beats a dead one. These are still surfaced as errors on the
  // Monitoring page and in the exported log, so they do not pass unnoticed.
  const survive = (kind: string) => (err: unknown) => {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    if (hub) hub.log('error', 'app', `${kind}: ${msg.split('\n')[0]}`)
    console.error(`[${kind}]`, msg)
  }
  process.on('uncaughtException', survive('uncaught exception'))
  process.on('unhandledRejection', survive('unhandled rejection'))

  app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    adoptPreviousConfig(userData)
    const store = new Store(path.join(userData, 'sbc.db'), makeCrypto())
    hub = new Hub(store)
    api = new ControlApi(hub)
    hub.on('state', pushState)
    hub.on('thumbs', pushThumbs)

    ipcMain.handle('sbc:action', async (e, name: string, payload: unknown) => {
      const fn = actions[name]
      if (!fn) throw new Error(`Unknown action: ${name}`)
      try {
        return (await fn(payload, e.sender.id)) ?? null
      } catch (err) {
        hub.log('error', 'action', `${name}: ${(err as Error).message}`)
        throw err
      }
    })

    // This app is a remote control: it never captures a camera, a screen or a
    // window. Deny every permission so nothing can raise an OS capture prompt.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => callback({}),
      { useSystemPicker: false },
    )

    buildMenu()
    createWindow()
    await hub.startup()
    await api.start().catch((e: Error) => hub.log('error', 'api', e.message))
  })

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', async () => {
    await api?.stop()
    await hub?.shutdown()
  })
}
