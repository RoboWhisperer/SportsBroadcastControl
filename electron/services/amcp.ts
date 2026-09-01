import net from 'node:net'
import { EventEmitter } from 'node:events'

/**
 * Minimal AMCP client for CasparCG Server.
 *
 * Protocol per the CasparCG 2.x AMCP specification:
 *   202 <CMD> OK            -> no payload
 *   201 <CMD> OK            -> exactly one payload line
 *   200 <CMD> OK            -> payload lines until a blank line
 *   400 ERROR               -> one extra line echoing the bad command
 *   4xx/5xx <CMD> ERROR     -> single line
 * Lines are CRLF terminated. Responses are not tagged, so commands are
 * serialised one at a time through a FIFO queue.
 */
export class AmcpError extends Error {
  constructor(readonly code: number, readonly command: string, message: string) {
    super(message)
    this.name = 'AmcpError'
  }
}

type Pending = {
  command: string
  resolve: (lines: string[]) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

export class AmcpClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  /** Lines collected for the in-flight command, and what we are still waiting for. */
  private want: 'header' | 'one' | 'until-blank' | 'error-echo' = 'header'
  private collected: string[] = []
  private queue: Pending[] = []
  private inflight: Pending | null = null
  connected = false

  constructor(
    private host: string,
    private port: number,
    private timeoutMs = 4000,
  ) {
    super()
  }

  connect(): Promise<void> {
    if (this.socket) this.destroy()
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port })
      this.socket = sock
      const onFail = (e: Error) => {
        cleanup()
        this.handleClose(e)
        reject(e)
      }
      const onOk = () => {
        cleanup()
        this.connected = true
        sock.setNoDelay(true)
        sock.on('data', (d: Buffer) => this.onData(d))
        sock.on('error', (e) => this.handleClose(e))
        sock.on('close', () => this.handleClose(new Error('socket closed')))
        this.emit('connect')
        resolve()
      }
      const timer = setTimeout(() => onFail(new Error(`connect timeout ${this.host}:${this.port}`)), this.timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        sock.off('connect', onOk)
        sock.off('error', onFail)
      }
      sock.once('connect', onOk)
      sock.once('error', onFail)
    })
  }

  private handleClose(err: Error) {
    if (!this.connected && !this.socket) return
    this.connected = false
    const sock = this.socket
    this.socket = null
    sock?.destroy()
    const dead = [this.inflight, ...this.queue].filter(Boolean) as Pending[]
    this.inflight = null
    this.queue = []
    this.buffer = ''
    this.want = 'header'
    this.collected = []
    for (const p of dead) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.emit('close', err)
  }

  destroy() {
    const sock = this.socket
    this.socket = null
    this.connected = false
    sock?.removeAllListeners()
    sock?.destroy()
    for (const p of [this.inflight, ...this.queue].filter(Boolean) as Pending[]) {
      clearTimeout(p.timer)
      p.reject(new Error('client destroyed'))
    }
    this.inflight = null
    this.queue = []
  }

  send(command: string): Promise<string[]> {
    if (!this.socket || !this.connected) return Promise.reject(new Error('AMCP not connected'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A timed-out command leaves the stream ambiguous; drop the connection
        // rather than mis-attribute the next response.
        this.handleClose(new AmcpError(0, command, `AMCP timeout: ${command}`))
      }, this.timeoutMs)
      this.queue.push({ command, resolve, reject, timer })
      this.pump()
    })
  }

  private pump() {
    if (this.inflight || !this.queue.length || !this.socket) return
    this.inflight = this.queue.shift()!
    this.want = 'header'
    this.collected = []
    this.socket.write(this.inflight.command + '\r\n')
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString('utf8')
    for (;;) {
      const i = this.buffer.indexOf('\r\n')
      if (i < 0) break
      const line = this.buffer.slice(0, i)
      this.buffer = this.buffer.slice(i + 2)
      this.onLine(line)
    }
  }

  private onLine(line: string) {
    const p = this.inflight
    if (!p) return // unsolicited (CasparCG does not push, but stay defensive)

    if (this.want === 'header') {
      const m = /^(\d{3})\s*(.*)$/.exec(line)
      if (!m) return
      const code = Number(m[1])
      if (code === 400) {
        this.want = 'error-echo'
        return
      }
      if (code >= 400) return this.finishError(code, `${code} ${m[2] || 'ERROR'}`)
      if (code === 202) return this.finishOk([])
      this.want = code === 201 ? 'one' : 'until-blank'
      return
    }

    if (this.want === 'error-echo') return this.finishError(400, `400 ERROR: ${line}`)
    if (this.want === 'one') return this.finishOk([line])
    if (line === '') return this.finishOk(this.collected)
    this.collected.push(line)
  }

  private settle(): Pending {
    const p = this.inflight!
    clearTimeout(p.timer)
    this.inflight = null
    this.want = 'header'
    this.collected = []
    return p
  }

  private finishOk(lines: string[]) {
    const p = this.settle()
    p.resolve(lines)
    this.pump()
  }

  private finishError(code: number, msg: string) {
    const p = this.settle()
    p.reject(new AmcpError(code, p.command, msg))
    this.pump()
  }
}

// ------------------------------------------------------------------ encoding

/** Escape a value for inclusion in an AMCP double-quoted parameter. */
export function amcpQuote(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"'
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Build the CasparCG `<templateData>` payload understood by Flash and most HTML templates. */
export function templateDataXml(data: Record<string, unknown>): string {
  const parts = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `<componentData id="${xmlEscape(k)}"><data id="text" value="${xmlEscape(String(v))}" /></componentData>`)
  return `<templateData>${parts.join('')}</templateData>`
}

/**
 * Parse one line of a TLS / CLS listing.
 *
 * Two formats are in the wild and both must work:
 *   - legacy, quoted with metadata:  `"SPORTS/SCOREBOARD" 12345 20240101120000`
 *   - CasparCG 2.5 via the media scanner, bare:  `SPORTS/SCOREBOARD`
 *
 * Bare names may contain spaces (`SPORTS/LOWER THIRD`), so the whole line is
 * the path. Returns null only for a blank line.
 */
export function parseListingLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const quoted = /^"([^"]*)"/.exec(trimmed)
  return quoted ? quoted[1] : trimmed
}
