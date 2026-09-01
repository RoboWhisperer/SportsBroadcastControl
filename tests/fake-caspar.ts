import net from 'node:net'

/**
 * Minimal stand-in for a CasparCG Server AMCP endpoint. Responses follow the
 * 2.x specification so the client is exercised against the real wire format.
 */
export interface FakeCaspar {
  port: number
  received: string[]
  close(): Promise<void>
  /** Force-close every client socket, simulating the server going away. */
  drop(): void
  /** Fail the next matching command with this AMCP error line. */
  failNext(prefix: string, line: string): void
  templates: string[]
  version: string
  /** Legacy servers quote listing lines; 2.5 does not. */
  quoteListings: boolean
}

export async function startFakeCaspar(opts: { silent?: boolean } = {}): Promise<FakeCaspar> {
  const received: string[] = []
  const sockets = new Set<net.Socket>()
  const failures = new Map<string, string>()
  const state = {
    templates: ['SPORTS/SCOREBOARD', 'SPORTS/LOWER-THIRD', 'SPORTS/PLAYER-INTRO'],
    version: '2.5.0.a1b2c3 STABLE',
    quoteListings: false,
  }

  const server = net.createServer((sock) => {
    sockets.add(sock)
    sock.on('close', () => sockets.delete(sock))
    sock.on('error', () => {})
    let buf = ''
    sock.on('data', (d) => {
      buf += d.toString('utf8')
      for (;;) {
        const i = buf.indexOf('\r\n')
        if (i < 0) break
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        received.push(line)
        if (opts.silent) continue
        sock.write(respond(line))
      }
    })
  })

  function respond(line: string): string {
    for (const [prefix, out] of failures) {
      if (line.startsWith(prefix)) {
        failures.delete(prefix)
        return out
      }
    }
    const verb = line.split(' ')[0].toUpperCase()
    if (verb === 'VERSION') return `201 VERSION OK\r\n${state.version}\r\n`
    if (verb === 'TLS') {
      // CasparCG 2.5 with the media scanner answers with bare names; older
      // servers quote them and append size and timestamp.
      const body = state.templates
        .map((t) => (state.quoteListings ? `"${t}" 12345 20240101120000\r\n` : `${t}\r\n`))
        .join('')
      return `200 TLS OK\r\n${body}\r\n`
    }
    if (verb === 'CG' || verb === 'CLEAR' || verb === 'PLAY' || verb === 'STOP') return `202 ${verb} OK\r\n`
    return `400 ERROR\r\n${line}\r\n`
  }

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as net.AddressInfo).port

  return {
    port,
    received,
    get templates() { return state.templates },
    set templates(t: string[]) { state.templates = t },
    get version() { return state.version },
    get quoteListings() { return state.quoteListings },
    set quoteListings(q: boolean) { state.quoteListings = q },
    failNext: (prefix, line) => failures.set(prefix, line),
    drop: () => { for (const s of sockets) s.destroy() },
    close: () =>
      new Promise((r) => {
        for (const s of sockets) s.destroy()
        server.close(() => r())
      }),
  }
}
