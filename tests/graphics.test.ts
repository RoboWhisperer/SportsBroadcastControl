import { afterEach, describe, expect, it, vi } from 'vitest'
import { CasparGraphics, MockGraphics, TemplateMissingError, TemplateNotMappedError } from '../electron/services/graphics'
import { GRAPHICS_ROLES, type TemplateMapping } from '../shared/types'
import { startFakeCaspar, type FakeCaspar } from './fake-caspar'

let server: FakeCaspar
let gfx: CasparGraphics | undefined
afterEach(async () => {
  await gfx?.disconnect()
  gfx = undefined
  await server?.close()
})

const mappings = (over: Partial<TemplateMapping> & { role: TemplateMapping['role'] }): TemplateMapping[] =>
  GRAPHICS_ROLES.map((role) => ({
    role,
    template: role === over.role ? (over.template ?? '') : '',
    layer: over.layer ?? 20,
    dataFormat: over.dataFormat ?? 'xml',
    fields: over.fields ?? {},
  }))

function make(server: FakeCaspar, maps: TemplateMapping[]) {
  const log = vi.fn()
  const events: unknown[] = []
  const g = new CasparGraphics({
    host: '127.0.0.1',
    port: server.port,
    channel: 1,
    mappings: () => maps,
    onStatus: () => {},
    onEvent: (e) => events.push(e),
    log,
  })
  return { g, log, events }
}

describe('CasparCG graphics controller', () => {
  it('connects, reads the version and discovers templates', async () => {
    server = await startFakeCaspar()
    const { g } = make(server, mappings({ role: 'scoreboard' }))
    gfx = g
    await g.connect()
    expect(g.getStatus().state).toBe('connected')
    expect(g.getStatus().version).toContain('2.5.0')
    expect(g.getStatus().templates).toContain('SPORTS/SCOREBOARD')
  })

  it('emits the documented CG commands for play, update and stop', async () => {
    server = await startFakeCaspar()
    const { g } = make(server, mappings({ role: 'lowerThird', template: 'SPORTS/LOWER-THIRD', layer: 21 }))
    gfx = g
    await g.connect()
    server.received.length = 0

    await g.play('lowerThird', { line1: 'Noah Smith', line2: 'Guard' })
    await g.update('lowerThird', { line1: 'Noah Smith', line2: 'Forward' })
    await g.stop('lowerThird')

    expect(server.received[0]).toBe(
      'CG 1-21 ADD 1 "SPORTS/LOWER-THIRD" 1 "<templateData>' +
        '<componentData id=\\"line1\\"><data id=\\"text\\" value=\\"Noah Smith\\" /></componentData>' +
        '<componentData id=\\"line2\\"><data id=\\"text\\" value=\\"Guard\\" /></componentData>' +
        '</templateData>"',
    )
    expect(server.received[1]).toContain('CG 1-21 UPDATE 1 "<templateData>')
    expect(server.received[1]).toContain('Forward')
    expect(server.received[2]).toBe('CG 1-21 STOP 1')
    expect(g.getStatus().onAir).toEqual([])
  })

  it('sends JSON when the mapped template asks for it, and applies field renames', async () => {
    server = await startFakeCaspar()
    const { g } = make(server, mappings({ role: 'playerIntro', template: 'SPORTS/PLAYER-INTRO', layer: 22, dataFormat: 'json', fields: { name: 'f0' } }))
    gfx = g
    await g.connect()
    server.received.length = 0
    await g.play('playerIntro', { name: 'Noah Smith', number: '24' })
    expect(server.received[0]).toBe('CG 1-22 ADD 1 "SPORTS/PLAYER-INTRO" 1 "{\\"f0\\":\\"Noah Smith\\",\\"number\\":\\"24\\"}"')
  })

  it('stays connected when the server has no media scanner and TLS fails', async () => {
    server = await startFakeCaspar()
    const { g, log } = make(server, mappings({ role: 'sponsor', template: 'SPORTS/SPONSOR', layer: 25 }))
    gfx = g
    server.failNext('TLS', '501 TLS FAILED\r\n')
    await g.connect()

    expect(g.getStatus().state).toBe('connected')
    expect(g.getStatus().templates).toEqual([])
    expect(log).toHaveBeenCalledWith('warn', expect.stringMatching(/Media Scanner/i))

    // With no list to check against, a mapped template is taken on trust and plays.
    server.received.length = 0
    await g.play('sponsor', { name: 'Main Street Diner' })
    expect(server.received[0]).toContain('CG 1-25 ADD 1 "SPORTS/SPONSOR"')
  })

  it('reads the bare listing format a CasparCG 2.5 server returns', async () => {
    server = await startFakeCaspar()
    server.templates = ['SBC-TEST', 'SPORTS/SCOREBOARD', 'SPORTS/LOWER THIRD']
    const { g } = make(server, mappings({ role: 'lowerThird', template: 'SPORTS/LOWER THIRD', layer: 21 }))
    gfx = g
    await g.connect()
    expect(g.getStatus().templates).toEqual(['SBC-TEST', 'SPORTS/SCOREBOARD', 'SPORTS/LOWER THIRD'])
    // A name with a space must survive quoting into the CG command.
    server.received.length = 0
    await g.play('lowerThird', { line1: 'Noah Smith' })
    expect(server.received[0]).toContain('CG 1-21 ADD 1 "SPORTS/LOWER THIRD" 1 ')
  })

  it('refuses to play an unmapped role', async () => {
    server = await startFakeCaspar()
    const { g } = make(server, mappings({ role: 'scoreboard' }))
    gfx = g
    await g.connect()
    await expect(g.play('sponsor')).rejects.toBeInstanceOf(TemplateNotMappedError)
  })

  it('refuses to play a template the server does not have installed', async () => {
    server = await startFakeCaspar()
    const { g } = make(server, mappings({ role: 'sponsor', template: 'SPORTS/DOES-NOT-EXIST' }))
    gfx = g
    await g.connect()
    await expect(g.play('sponsor')).rejects.toBeInstanceOf(TemplateMissingError)
  })

  it('clears every layer on the channel', async () => {
    server = await startFakeCaspar()
    const { g } = make(server, mappings({ role: 'scoreboard', template: 'SPORTS/SCOREBOARD' }))
    gfx = g
    await g.connect()
    await g.play('scoreboard')
    expect(g.getStatus().onAir).toEqual(['scoreboard'])
    server.received.length = 0
    await g.clearAll()
    expect(server.received).toEqual(['CLEAR 1'])
    expect(g.getStatus().onAir).toEqual([])
  })

  it('reports disconnection, drops on-air state and schedules a reconnect', async () => {
    server = await startFakeCaspar()
    const { g, events } = make(server, mappings({ role: 'scoreboard', template: 'SPORTS/SCOREBOARD' }))
    gfx = g
    await g.connect()
    await g.play('scoreboard')

    server.drop()
    await vi.waitFor(() => expect(g.getStatus().state).toBe('error'))
    expect(g.getStatus().onAir).toEqual([])
    expect(events).toContainEqual({ type: 'disconnected' })
    // Reconnects on its own once the server answers again.
    await vi.waitFor(() => expect(g.getStatus().state).toBe('connected'), { timeout: 8000 })
    expect(events.filter((e) => (e as { type: string }).type === 'connected').length).toBeGreaterThan(1)
  }, 15000)

  it('surfaces an error rather than throwing when the server is unreachable', async () => {
    const log = vi.fn()
    const g = new CasparGraphics({ host: '127.0.0.1', port: 1, channel: 1, mappings: () => [], onStatus: () => {}, onEvent: () => {}, log })
    gfx = g
    await g.connect()
    expect(g.getStatus().state).toBe('error')
    await expect(g.play('scoreboard')).rejects.toBeInstanceOf(TemplateNotMappedError)
  })
})

describe('mock graphics', () => {
  it('behaves like the real controller with no server present', async () => {
    const g = new MockGraphics({ onStatus: () => {}, onEvent: () => {}, log: () => {} })
    await g.connect()
    expect(g.getStatus().state).toBe('connected')
    await g.play('sponsor')
    expect(g.getStatus().onAir).toEqual(['sponsor'])
    await g.stop('sponsor')
    expect(g.getStatus().onAir).toEqual([])
  })
})
