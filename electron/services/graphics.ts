import { AmcpClient, amcpQuote, parseListingLine, templateDataXml } from './amcp.js'
import type { GraphicsRole, GraphicsStatus, TemplateMapping } from '../../shared/types.js'

export interface GraphicsController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getTemplates(): Promise<string[]>
  getStatus(): GraphicsStatus
  play(role: GraphicsRole, data?: Record<string, unknown>): Promise<void>
  update(role: GraphicsRole, data: Record<string, unknown>): Promise<void>
  stop(role?: GraphicsRole): Promise<void>
  /** Emergency: wipe every graphics layer on the channel. */
  clearAll(): Promise<void>
}

export interface GraphicsDeps {
  host: string
  port: number
  channel: number
  mappings: () => TemplateMapping[]
  onStatus: (s: GraphicsStatus) => void
  onEvent: (e: { type: 'played' | 'stopped' | 'connected' | 'disconnected'; role?: GraphicsRole }) => void
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
}

export class TemplateNotMappedError extends Error {
  constructor(readonly role: GraphicsRole) {
    super(`No template mapped for "${role}". Open Graphics > Template Mapping.`)
  }
}
export class TemplateMissingError extends Error {
  constructor(readonly role: GraphicsRole, readonly template: string) {
    super(`Template "${template}" (${role}) is not installed on the graphics server.`)
  }
}

const RECONNECT_MS = [1000, 2000, 4000, 8000, 15000]
const HEALTH_MS = 5000

export class CasparGraphics implements GraphicsController {
  private client: AmcpClient | null = null
  private status: GraphicsStatus = {
    state: 'disconnected',
    detail: 'Not connected',
    lastOk: 0,
    engine: 'CasparCG Server',
    version: '',
    templates: [],
    onAir: [],
  }
  private attempt = 0
  private timer: NodeJS.Timeout | null = null
  private wantConnection = false

  constructor(private deps: GraphicsDeps) {}

  getStatus() {
    return this.status
  }

  private set(patch: Partial<GraphicsStatus>) {
    this.status = { ...this.status, ...patch }
    this.deps.onStatus(this.status)
  }

  async connect(): Promise<void> {
    this.wantConnection = true
    this.attempt = 0
    await this.dial()
  }

  private async dial(): Promise<void> {
    if (!this.wantConnection) return
    this.clearTimer()
    this.set({ state: 'connecting', detail: `Connecting to ${this.deps.host}:${this.deps.port}` })
    const client = new AmcpClient(this.deps.host, this.deps.port)
    client.on('close', (e: Error) => {
      if (this.client !== client) return
      this.client = null
      this.set({ state: 'error', detail: e.message, onAir: [] })
      this.deps.log('warn', `Graphics server disconnected: ${e.message}`)
      this.deps.onEvent({ type: 'disconnected' })
      this.scheduleReconnect()
    })

    try {
      await client.connect()
      this.client = client
      const [version] = await client.send('VERSION')
      this.set({ state: 'connected', detail: `CasparCG ${version ?? ''}`.trim(), version: version ?? '', lastOk: Date.now() })
      this.deps.log('info', `Graphics server connected (CasparCG ${version ?? '?'})`)
      this.deps.onEvent({ type: 'connected' })
      this.attempt = 0
      // Template discovery is delegated by CasparCG to the Media Scanner. A
      // server running without it answers TLS with 501, which must not make a
      // perfectly usable connection look broken - CG commands still work.
      try {
        await this.getTemplates()
      } catch (e) {
        this.deps.log('warn', `Template list unavailable (${(e as Error).message}). Is the CasparCG Media Scanner running? Templates can still be entered by name.`)
      }
      this.scheduleHealth()
    } catch (e) {
      client.destroy()
      this.set({ state: 'error', detail: (e as Error).message })
      this.scheduleReconnect()
    }
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private scheduleReconnect() {
    if (!this.wantConnection) return
    this.clearTimer()
    const wait = RECONNECT_MS[Math.min(this.attempt++, RECONNECT_MS.length - 1)]
    this.set({ detail: `Reconnecting in ${wait / 1000}s...` })
    this.timer = setTimeout(() => void this.dial(), wait)
  }

  private scheduleHealth() {
    this.clearTimer()
    this.timer = setTimeout(async () => {
      if (!this.client?.connected) return this.scheduleReconnect()
      try {
        await this.client.send('VERSION')
        this.set({ lastOk: Date.now() })
        this.scheduleHealth()
      } catch {
        /* the close handler drives reconnection */
      }
    }, HEALTH_MS)
  }

  async disconnect(): Promise<void> {
    this.wantConnection = false
    this.clearTimer()
    this.client?.destroy()
    this.client = null
    this.set({ state: 'disconnected', detail: 'Not connected', onAir: [], templates: [] })
  }

  async getTemplates(): Promise<string[]> {
    if (!this.client?.connected) return this.status.templates
    const lines = await this.client.send('TLS')
    const templates = lines.map(parseListingLine).filter((t): t is string => !!t)
    this.set({ templates })
    return templates
  }

  private resolve(role: GraphicsRole) {
    const m = this.deps.mappings().find((x) => x.role === role)
    if (!m || !m.template) throw new TemplateNotMappedError(role)
    // TLS paths are reported upper-case; compare case-insensitively.
    if (this.status.templates.length && !this.status.templates.some((t) => t.toUpperCase() === m.template.toUpperCase())) {
      throw new TemplateMissingError(role, m.template)
    }
    return m
  }

  private payload(m: TemplateMapping, data: Record<string, unknown>) {
    const mapped: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) mapped[m.fields[k] ?? k] = v
    return m.dataFormat === 'json' ? JSON.stringify(mapped) : templateDataXml(mapped)
  }

  private cg(m: TemplateMapping, verb: string) {
    return `CG ${this.deps.channel}-${m.layer} ${verb}`
  }

  private require() {
    if (!this.client?.connected) throw new Error('Graphics server offline')
    return this.client
  }

  async play(role: GraphicsRole, data: Record<string, unknown> = {}): Promise<void> {
    const m = this.resolve(role)
    const c = this.require()
    await c.send(`${this.cg(m, 'ADD')} 1 ${amcpQuote(m.template)} 1 ${amcpQuote(this.payload(m, data))}`)
    if (!this.status.onAir.includes(role)) this.set({ onAir: [...this.status.onAir, role] })
    this.deps.log('info', `Graphics PLAY ${role} -> ${m.template} (layer ${m.layer})`)
    this.deps.onEvent({ type: 'played', role })
  }

  async update(role: GraphicsRole, data: Record<string, unknown>): Promise<void> {
    const m = this.resolve(role)
    const c = this.require()
    await c.send(`${this.cg(m, 'UPDATE')} 1 ${amcpQuote(this.payload(m, data))}`)
  }

  async stop(role?: GraphicsRole): Promise<void> {
    const roles = role ? [role] : [...this.status.onAir]
    const c = this.require()
    for (const r of roles) {
      const m = this.deps.mappings().find((x) => x.role === r)
      if (!m?.template) continue
      await c.send(`${this.cg(m, 'STOP')} 1`)
      this.deps.log('info', `Graphics STOP ${r}`)
    }
    this.set({ onAir: this.status.onAir.filter((r) => !roles.includes(r)) })
    this.deps.onEvent({ type: 'stopped', role })
  }

  async clearAll(): Promise<void> {
    const c = this.require()
    await c.send(`CLEAR ${this.deps.channel}`)
    this.set({ onAir: [] })
    this.deps.log('warn', 'Graphics: all layers cleared')
    this.deps.onEvent({ type: 'stopped' })
  }
}

/** Demo provider: same contract, no server, so students can practise safely. */
export class MockGraphics implements GraphicsController {
  private status: GraphicsStatus = {
    state: 'disconnected',
    detail: 'Demo mode',
    lastOk: 0,
    engine: 'Mock Graphics (Demo)',
    version: 'demo',
    templates: [
      'DEMO/SCOREBOARD',
      'DEMO/LOWER-THIRD',
      'DEMO/PLAYER-INTRO',
      'DEMO/STARTING-LINEUP',
      'DEMO/COACH',
      'DEMO/SPONSOR',
      'DEMO/FULLSCREEN',
      'DEMO/HALFTIME',
      'DEMO/FINAL',
      'DEMO/FIRST-DOWN',
      'DEMO/TOUCHDOWN',
    ],
    onAir: [],
  }
  constructor(private deps: Pick<GraphicsDeps, 'onStatus' | 'onEvent' | 'log'>) {}
  private set(p: Partial<GraphicsStatus>) {
    this.status = { ...this.status, ...p }
    this.deps.onStatus(this.status)
  }
  getStatus() {
    return this.status
  }
  async connect() {
    this.set({ state: 'connected', detail: 'Demo mode - not on air', lastOk: Date.now() })
    this.deps.onEvent({ type: 'connected' })
  }
  async disconnect() {
    this.set({ state: 'disconnected', detail: 'Demo mode', onAir: [] })
  }
  async getTemplates() {
    return this.status.templates
  }
  async play(role: GraphicsRole) {
    if (!this.status.onAir.includes(role)) this.set({ onAir: [...this.status.onAir, role] })
    this.deps.log('info', `[demo] graphics play ${role}`)
    this.deps.onEvent({ type: 'played', role })
  }
  async update() {}
  async stop(role?: GraphicsRole) {
    this.set({ onAir: role ? this.status.onAir.filter((r) => r !== role) : [] })
    this.deps.onEvent({ type: 'stopped', role })
  }
  async clearAll() {
    this.set({ onAir: [] })
    this.deps.onEvent({ type: 'stopped' })
  }
}
