import express, { type Request, type Response, type NextFunction } from 'express'
import { createServer, type Server } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import { GRAPHICS_ROLES } from '../shared/types.js'
import type { Hub } from './hub.js'

const Role = z.enum(GRAPHICS_ROLES)
const GamePatch = z.object({
  homeScore: z.number().int().min(0).max(999).optional(),
  awayScore: z.number().int().min(0).max(999).optional(),
  period: z.string().max(24).optional(),
  clock: z.string().max(16).optional(),
  shotClock: z.string().max(8).optional(),
  possession: z.enum(['home', 'away']).nullable().optional(),
  homeFouls: z.number().int().min(0).max(99).optional(),
  awayFouls: z.number().int().min(0).max(99).optional(),
  homeTimeouts: z.number().int().min(0).max(99).optional(),
  awayTimeouts: z.number().int().min(0).max(99).optional(),
  down: z.number().int().min(1).max(4).optional(),
  distance: z.number().int().min(0).max(99).optional(),
  ballOn: z.string().max(8).optional(),
  homeTeam: z.object({ name: z.string().max(64), abbr: z.string().max(6), color: z.string().max(16) }).optional(),
  awayTeam: z.object({ name: z.string().max(64), abbr: z.string().max(6), color: z.string().max(16) }).optional(),
})
/** Template data is forwarded to a third-party renderer: keep it flat and bounded. */
const GfxData = z.record(z.string().max(64), z.union([z.string().max(512), z.number(), z.boolean()])).default({})
const ReplayBody = z.object({ seconds: z.number().int().min(1).max(120).optional(), speed: z.number().int().min(10).max(200).optional() })

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export class ControlApi {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()

  constructor(private hub: Hub) {
    // Owned here rather than by the caller, so an API instance always relays
    // events to its clients no matter who constructed it.
    hub.on('event', (e) => this.broadcast(e))
    // Port, token or LAN access changed: rebind rather than silently keep serving
    // the old configuration until someone presses Restart API.
    hub.on('api-config', () => void this.start().catch((e: Error) => hub.log('error', 'api', e.message)))
  }

  get running() {
    return !!this.server
  }

  async start(): Promise<void> {
    await this.stop()
    const cfg = this.hub.state.settings.api
    if (!cfg.enabled) return
    if (!cfg.token) {
      this.hub.log('error', 'api', 'Control API not started: no token configured')
      return
    }

    const app = express()
    app.disable('x-powered-by')
    app.use(express.json({ limit: '64kb' }))

    app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      const header = req.get('authorization') ?? ''
      const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
      const supplied = bearer || String(req.query.token ?? '')
      if (!supplied || !safeEqual(supplied, cfg.token)) {
        res.status(401).json({ error: 'unauthorized' })
        return
      }
      next()
    })

    const ok = (res: Response) => res.json({ ok: true })
    /** Stream Deck's website action can only issue GETs, so triggers accept both verbs. */
    const trigger = (path: string, fn: (req: Request) => Promise<unknown>) =>
      app.all(path, async (req: Request, res: Response) => {
        try {
          const out = await fn(req)
          res.json({ ok: true, ...(out && typeof out === 'object' ? out : {}) })
        } catch (e) {
          res.status(400).json({ ok: false, error: (e as Error).message })
        }
      })

    const s = () => this.hub.state

    app.get('/api/status', (_req, res) => {
      res.json({
        version: s().version,
        productionName: s().settings.productionName,
        demoMode: s().settings.demoMode,
        obs: s().obs,
        graphics: s().graphics,
        replay: s().replay,
        cameras: s().cameras,
        game: s().game,
        sport: s().settings.activeSport,
        venue: s().settings.activeVenueId,
      })
    })

    app.get('/api/cameras', (_req, res) => res.json(s().cameras))
    trigger('/api/cameras/:id/take', async (req) => {
      await this.hub.takeCamera(z.string().max(64).parse(req.params.id))
    })

    app.get('/api/scenes', (_req, res) =>
      res.json({ scenes: s().obs.scenes, current: s().obs.currentScene, preview: s().obs.previewScene, studioMode: s().obs.studioMode }),
    )
    trigger('/api/scenes/:name/preview', async (req) => {
      await this.hub.setPreviewScene(z.string().max(256).parse(req.params.name))
    })
    trigger('/api/transition', () => this.hub.transition())
    trigger('/api/studio/:on', async (req) => {
      await this.hub.setStudioMode(z.enum(['on', 'off']).parse(req.params.on) === 'on')
    })
    trigger('/api/scenes/:name/take', async (req) => {
      await this.hub.setScene(z.string().max(256).parse(req.params.name))
    })

    trigger('/api/stream/start', () => this.hub.setStreaming(true))
    trigger('/api/stream/stop', () => this.hub.setStreaming(false))
    trigger('/api/record/start', () => this.hub.setRecording(true))
    trigger('/api/record/stop', () => this.hub.setRecording(false))

    trigger('/api/replay/buffer/start', () => this.hub.setReplayBuffer(true))
    trigger('/api/replay/buffer/stop', () => this.hub.setReplayBuffer(false))
    trigger('/api/replay/save', () => this.hub.saveReplay())
    trigger('/api/replay/play', async (req) => {
      const body = ReplayBody.parse({
        seconds: req.body?.seconds ?? (req.query.seconds ? Number(req.query.seconds) : undefined),
        speed: req.body?.speed ?? (req.query.speed ? Number(req.query.speed) : undefined),
      })
      const cfg = s().settings.replay
      await this.hub.replayLast(body.seconds ?? cfg.defaultDuration, body.speed ?? cfg.defaultSpeed)
    })
    trigger('/api/replay/live', () => this.hub.returnToLive())

    app.get('/api/game', (_req, res) => res.json(s().game))
    app.patch('/api/game', async (req, res) => {
      const parsed = GamePatchSafe(req.body)
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: parsed.error })
        return
      }
      await this.hub.patchGame(parsed.data)
      ok(res)
    })

    app.get('/api/graphics', (_req, res) =>
      res.json({
        engine: s().graphics.engine,
        status: s().graphics.state,
        templates: s().graphics.templates,
        onAir: s().graphics.onAir,
        mappings: s().mappings,
      }),
    )
    trigger('/api/graphics/:role/play', async (req) => {
      const role = Role.parse(req.params.role)
      await this.hub.graphicsPlay(role, GfxData.parse(req.body ?? {}))
    })
    trigger('/api/graphics/:role/stop', async (req) => {
      await this.hub.graphicsStop(Role.parse(req.params.role))
    })
    trigger('/api/graphics/clear', () => this.hub.graphicsClearAll())

    trigger('/api/emergency/safe', () => this.hub.safeScene())
    trigger('/api/emergency/mute', () => this.hub.muteMic())

    app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }))
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      this.hub.log('error', 'api', err.message)
      res.status(500).json({ error: 'internal error' })
    })

    const host = cfg.allowLan ? '0.0.0.0' : '127.0.0.1'
    const server = createServer(app)
    this.wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const supplied = url.searchParams.get('token') ?? ''
      if (url.pathname !== '/ws' || !supplied || !safeEqual(supplied, cfg.token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.clients.add(ws)
        ws.on('close', () => this.clients.delete(ws))
        ws.send(JSON.stringify({ type: 'state', state: this.hub.state }))
      })
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(cfg.port, host, () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    this.hub.log('info', 'api', `Control API on http://${host}:${cfg.port} (WebSocket /ws)${cfg.allowLan ? ' — LAN ACCESS ENABLED' : ''}`)
  }

  broadcast(msg: unknown) {
    const json = JSON.stringify(msg)
    for (const c of this.clients) if (c.readyState === 1) c.send(json)
  }

  async stop() {
    for (const c of this.clients) c.close()
    this.clients.clear()
    this.wss?.close()
    this.wss = null
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((r) => server.close(() => r()))
  }
}

function GamePatchSafe(body: unknown) {
  const r = GamePatch.safeParse(body)
  return r.success ? { success: true as const, data: r.data } : { success: false as const, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}
