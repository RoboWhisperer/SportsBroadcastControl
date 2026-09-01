import { Bonjour } from 'bonjour-service'
import net from 'node:net'
import type { Camera } from '../../shared/types.js'

/**
 * Camera registry.
 *
 * NDI sources are found with mDNS (`_ndi._tcp`), which is how the NDI SDK
 * advertises them - no native NDI library and no video decoding. Everything
 * else is probed at the transport level (TCP reachability) because we cannot
 * assume a vendor API exists. Video itself always travels through OBS.
 */
export interface CameraDeps {
  cameras: () => Camera[]
  save: (c: Camera) => void
  onEvent: (e: { type: 'camera.status'; camera: Camera }) => void
  onSources: (names: string[]) => void
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
}

const PROBE_MS = 5000
const OFFLINE_AFTER_MS = 15000

/** Split "HOST (Source Name)" or "host:port" into a probe target. */
export function probeTarget(source: string): { host: string; port: number } | null {
  const s = source.trim()
  if (!s) return null
  const url = /^(?:rtsp|srt|rtmp|http|https):\/\/([^/:\s]+)(?::(\d+))?/i.exec(s)
  if (url) return { host: url[1], port: Number(url[2] || (s.toLowerCase().startsWith('rtsp') ? 554 : 80)) }
  const hostPort = /^([A-Za-z0-9._-]+):(\d+)$/.exec(s)
  if (hostPort) return { host: hostPort[1], port: Number(hostPort[2]) }
  return null
}

function tcpAlive(host: string, port: number, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port })
    const done = (ok: boolean) => {
      sock.removeAllListeners()
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(timeout, () => done(false))
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
  })
}

export class CameraRegistry {
  private bonjour: Bonjour | null = null
  private ndi = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null
  private demo = false

  constructor(private deps: CameraDeps) {}

  start(opts: { discovery: boolean; demo: boolean }) {
    this.stop()
    this.demo = opts.demo
    if (opts.discovery && !opts.demo) {
      try {
        this.bonjour = new Bonjour()
        const browser = this.bonjour.find({ type: 'ndi', protocol: 'tcp' })
        browser.on('up', (svc) => {
          this.ndi.set(svc.name, Date.now())
          this.deps.onSources([...this.ndi.keys()])
          this.deps.log('info', `NDI source found: ${svc.name}`)
        })
        browser.on('down', (svc) => {
          this.ndi.delete(svc.name)
          this.deps.onSources([...this.ndi.keys()])
          this.deps.log('warn', `NDI source lost: ${svc.name}`)
        })
      } catch (e) {
        this.deps.log('warn', `NDI discovery unavailable: ${(e as Error).message}`)
      }
    }
    if (opts.demo) {
      this.ndi = new Map(['CAM1 (Court Wide)', 'CAM2 (Basket)', 'CAM3 (Bench)', 'CAM4 (Crowd)'].map((n) => [n, Date.now()]))
      this.deps.onSources([...this.ndi.keys()])
    }
    this.timer = setInterval(() => void this.probe(), PROBE_MS)
    void this.probe()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.bonjour?.destroy()
    this.bonjour = null
  }

  private async probe() {
    for (const cam of this.deps.cameras()) {
      // Only shots with an address to test can be proved up or down.
      if (!cam.address) continue
      const online = await this.isOnline(cam)
      // Only a change is worth a database write and a state push; an idle rig
      // must stay silent.
      if (online === cam.online) continue
      const next = { ...cam, online }
      this.deps.save(next)
      this.deps.onEvent({ type: 'camera.status', camera: next })
      this.deps.log(online ? 'info' : 'warn', `${cam.name} ${online ? 'online' : 'OFFLINE'}`)
    }
  }

  private async isOnline(cam: Camera): Promise<boolean> {
    if (this.demo) return true
    if (cam.type === 'NDI') {
      const seen = this.ndi.get(cam.address)
      return !!seen && Date.now() - seen < OFFLINE_AFTER_MS
    }
    const t = probeTarget(cam.address)
    if (!t) return cam.online ?? false // unparseable address; do not flap the light
    return tcpAlive(t.host, t.port)
  }
}
