import { afterEach, describe, expect, it } from 'vitest'
import { AmcpClient, AmcpError, amcpQuote, parseListingLine, templateDataXml } from '../electron/services/amcp'
import { startFakeCaspar, type FakeCaspar } from './fake-caspar'

let server: FakeCaspar
afterEach(async () => server?.close())

describe('AMCP encoding', () => {
  it('quotes and escapes parameters so template data cannot break the command line', () => {
    expect(amcpQuote('plain')).toBe('"plain"')
    expect(amcpQuote('say "hi"')).toBe('"say \\"hi\\""')
    expect(amcpQuote('back\\slash')).toBe('"back\\\\slash"')
    expect(amcpQuote('two\nlines')).toBe('"two\\nlines"')
  })

  it('builds templateData XML and escapes markup in values', () => {
    expect(templateDataXml({ name: 'Noah', num: 24 })).toBe(
      '<templateData>' +
        '<componentData id="name"><data id="text" value="Noah" /></componentData>' +
        '<componentData id="num"><data id="text" value="24" /></componentData>' +
        '</templateData>',
    )
    expect(templateDataXml({ t: 'A & B <c> "d"' })).toContain('value="A &amp; B &lt;c&gt; &quot;d&quot;"')
    // Undefined fields are dropped rather than sent as the string "undefined".
    expect(templateDataXml({ a: 'x', b: undefined })).not.toContain('"b"')
  })

  it('parses both TLS listing formats seen in the wild', () => {
    // Legacy quoted form, with size and timestamp.
    expect(parseListingLine('"SPORTS/SCOREBOARD" 1234 20240101120000')).toBe('SPORTS/SCOREBOARD')
    // CasparCG 2.5 via the media scanner returns bare names — captured verbatim
    // from a real 2.5.0 server, where names may contain spaces.
    expect(parseListingLine('SBC-TEST')).toBe('SBC-TEST')
    expect(parseListingLine('SPORTS/SCOREBOARD')).toBe('SPORTS/SCOREBOARD')
    expect(parseListingLine('SPORTS/LOWER THIRD')).toBe('SPORTS/LOWER THIRD')
    expect(parseListingLine('')).toBeNull()
    expect(parseListingLine('   ')).toBeNull()
  })
})

describe('AMCP client', () => {
  it('handles 201 single-line, 200 multi-line and 202 empty responses', async () => {
    server = await startFakeCaspar()
    const c = new AmcpClient('127.0.0.1', server.port)
    await c.connect()
    expect(await c.send('VERSION')).toEqual(['2.5.0.a1b2c3 STABLE'])
    expect(await c.send('TLS')).toEqual(['SPORTS/SCOREBOARD', 'SPORTS/LOWER-THIRD', 'SPORTS/PLAYER-INTRO'])
    expect(await c.send('CG 1-20 STOP 1')).toEqual([])
    c.destroy()
  })

  it('rejects on a 400 and stays usable for the next command', async () => {
    server = await startFakeCaspar()
    const c = new AmcpClient('127.0.0.1', server.port)
    await c.connect()
    await expect(c.send('NONSENSE')).rejects.toBeInstanceOf(AmcpError)
    // The 400 echo line must be consumed, or this response would be misread.
    expect(await c.send('VERSION')).toEqual(['2.5.0.a1b2c3 STABLE'])
    c.destroy()
  })

  it('rejects on a single-line error code', async () => {
    server = await startFakeCaspar()
    const c = new AmcpClient('127.0.0.1', server.port)
    await c.connect()
    server.failNext('CG', '404 CG ERROR\r\n')
    await expect(c.send('CG 1-20 ADD 1 "MISSING" 1 ""')).rejects.toMatchObject({ code: 404 })
    expect(await c.send('VERSION')).toEqual(['2.5.0.a1b2c3 STABLE'])
    c.destroy()
  })

  it('serialises commands so responses are never mis-attributed', async () => {
    server = await startFakeCaspar()
    const c = new AmcpClient('127.0.0.1', server.port)
    await c.connect()
    const [a, b, d] = await Promise.all([c.send('VERSION'), c.send('TLS'), c.send('VERSION')])
    expect(a).toEqual(['2.5.0.a1b2c3 STABLE'])
    expect(b).toHaveLength(3)
    expect(d).toEqual(['2.5.0.a1b2c3 STABLE'])
    expect(server.received).toEqual(['VERSION', 'TLS', 'VERSION'])
    c.destroy()
  })

  it('fails every queued command when the server disappears mid-flight', async () => {
    server = await startFakeCaspar({ silent: true })
    const c = new AmcpClient('127.0.0.1', server.port, 300)
    await c.connect()
    const p1 = c.send('VERSION')
    const p2 = c.send('TLS')
    server.drop()
    await expect(p1).rejects.toThrow()
    await expect(p2).rejects.toThrow()
    expect(c.connected).toBe(false)
  })

  it('times out rather than hanging the caller when the server never answers', async () => {
    server = await startFakeCaspar({ silent: true })
    const c = new AmcpClient('127.0.0.1', server.port, 150)
    await c.connect()
    await expect(c.send('VERSION')).rejects.toThrow(/timeout/i)
    c.destroy()
  })

  it('reports a connect failure instead of throwing asynchronously', async () => {
    const c = new AmcpClient('127.0.0.1', 1, 500)
    await expect(c.connect()).rejects.toThrow()
    c.destroy()
  })
})
