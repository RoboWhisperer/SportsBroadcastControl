import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { Store } from '../electron/db'
import { Hub } from '../electron/hub'
import { ControlApi } from '../electron/api'

let dir: string
let hub: Hub
let api: ControlApi
let base: string
let token: string

const call = (p: string, init?: RequestInit) => fetch(`${base}${p}`, init)
const auth = (p: string, init: RequestInit = {}) =>
  call(p, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'sbc-api-'))
  hub = new Hub(new Store(path.join(dir, 'sbc.db')))
  // Port 0 lets the OS pick a free one; read it back off the running server.
  await hub.saveSettings({ ...hub.state.settings, api: { ...hub.state.settings.api, port: 0 } })
  await hub.startup()
  api = new ControlApi(hub)
  await api.start()
  token = hub.state.settings.api.token
  base = `http://127.0.0.1:${(api as unknown as { server: { address(): { port: number } } }).server.address().port}`
})
afterEach(async () => {
  await api.stop()
  await hub.shutdown()
  rmSync(dir, { recursive: true, force: true })
})

describe('control API — authentication', () => {
  it('rejects a request with no token', async () => {
    expect((await call('/api/status')).status).toBe(401)
  })
  it('rejects a wrong token of the same length', async () => {
    expect((await call(`/api/status?token=${'0'.repeat(token.length)}`)).status).toBe(401)
  })
  it('accepts a bearer header and a query token', async () => {
    expect((await auth('/api/status')).status).toBe(200)
    expect((await call(`/api/status?token=${token}`)).status).toBe(200)
  })
  it('does not leak routes to an unauthenticated caller', async () => {
    expect((await call('/api/graphics')).status).toBe(401)
    expect((await call('/api/nope')).status).toBe(401)
  })
})

describe('control API — status and control', () => {
  it('reports system status', async () => {
    const body = await (await auth('/api/status')).json()
    expect(body.obs.state).toBe('connected')
    expect(body.demoMode).toBe(true)
    // Six because the mock OBS has six scenes — the app mirrors OBS, it does not seed.
    expect(body.cameras.map((c: { id: string }) => c.id)).toEqual(body.obs.scenes)
    // Thumbnails are megabytes of base64; they must never be in a polled status response.
    expect(JSON.stringify(body)).not.toContain('data:image/')
  })

  it('takes a camera over GET, which is all a Stream Deck can send', async () => {
    // The camera id is the OBS scene name.
    expect((await auth('/api/cameras/CAM%203/take')).status).toBe(200)
    expect(hub.state.obs.currentScene).toBe('CAM 3')
  })

  it('drives stream, record and replay', async () => {
    await auth('/api/stream/start')
    expect(hub.state.obs.streaming).toBe(true)
    await auth('/api/record/start')
    expect(hub.state.obs.recording).toBe(true)
    await auth('/api/replay/buffer/start')
    expect(hub.state.replay.bufferActive).toBe(true)
    expect((await (await auth('/api/replay/save')).json()).ok).toBe(true)
  })

  it('plays and stops a graphic by role', async () => {
    await auth('/api/graphics/sponsor/play', { method: 'POST', body: JSON.stringify({ name: 'Main Street Diner' }) })
    expect(hub.state.graphics.onAir).toContain('sponsor')
    await auth('/api/graphics/sponsor/stop')
    expect(hub.state.graphics.onAir).not.toContain('sponsor')
  })

  it('previews and cuts through the API when studio mode is on', async () => {
    await auth('/api/studio/on')
    await auth('/api/scenes/CAM%204/preview')
    let body = await (await auth('/api/scenes')).json()
    expect(body.studioMode).toBe(true)
    expect(body.preview).toBe('CAM 4')
    expect(body.current).not.toBe('CAM 4')

    await auth('/api/transition')
    body = await (await auth('/api/scenes')).json()
    expect(body.current).toBe('CAM 4')
  })

  it('refuses a preview change while studio mode is off', async () => {
    await auth('/api/studio/off')
    const before = (await (await auth('/api/scenes')).json()).current
    await auth('/api/scenes/CAM%201/preview')
    const after = await (await auth('/api/scenes')).json()
    expect(after.preview).toBe('')
    expect(after.current).toBe(before)
    expect(hub.state.alerts.at(-1)?.msg).toMatch(/Studio Mode/i)
  })

  it('rejects an unknown graphics role', async () => {
    const r = await auth('/api/graphics/not-a-role/play', { method: 'POST', body: '{}' })
    expect(r.status).toBe(400)
  })
})

describe('control API — input validation', () => {
  it('accepts a valid game patch', async () => {
    const r = await auth('/api/game', { method: 'PATCH', body: JSON.stringify({ homeScore: 12, period: 'Q2' }) })
    expect(r.status).toBe(200)
    expect(hub.state.game.homeScore).toBe(12)
  })

  it('rejects out-of-range and wrong-typed scoreboard values', async () => {
    for (const bad of [{ homeScore: -1 }, { homeScore: 10_000 }, { homeScore: 'twelve' }, { possession: 'referee' }, { period: 'x'.repeat(100) }]) {
      const r = await auth('/api/game', { method: 'PATCH', body: JSON.stringify(bad) })
      expect(r.status, JSON.stringify(bad)).toBe(400)
    }
    expect(hub.state.game.homeScore).toBe(0)
  })

  it('rejects nested objects in template data, which the renderer cannot take', async () => {
    const r = await auth('/api/graphics/sponsor/play', { method: 'POST', body: JSON.stringify({ nested: { a: 1 } }) })
    expect(r.status).toBe(400)
  })
})

describe('control API — WebSocket events', () => {
  it('requires a token to upgrade', async () => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`)
    await expect(new Promise((_r, rej) => ws.on('error', rej))).rejects.toThrow(/401/)
  })

  it('sends a state snapshot then live events', async () => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${token}`)
    const messages: Record<string, unknown>[] = []
    ws.on('message', (d) => messages.push(JSON.parse(String(d))))
    await new Promise((r) => ws.on('open', r))
    await new Promise((r) => setTimeout(r, 50))
    expect(messages[0].type).toBe('state')

    await hub.takeCamera('CAM 4')
    await hub.patchGame({ awayScore: 3 })
    await new Promise((r) => setTimeout(r, 50))
    expect(messages.map((m) => m.type)).toContain('obs.sceneChanged')
    expect(messages.map((m) => m.type)).toContain('game.updated')
    ws.close()
  })
})
