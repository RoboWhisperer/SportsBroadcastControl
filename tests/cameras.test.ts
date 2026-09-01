import { describe, expect, it } from 'vitest'
import { probeTarget } from '../electron/services/cameras'

describe('camera address parsing', () => {
  it('understands the address forms a school rig actually uses', () => {
    expect(probeTarget('rtsp://192.168.1.50/stream1')).toEqual({ host: '192.168.1.50', port: 554 })
    expect(probeTarget('rtsp://192.168.1.50:8554/stream1')).toEqual({ host: '192.168.1.50', port: 8554 })
    expect(probeTarget('http://cam.local/video')).toEqual({ host: 'cam.local', port: 80 })
    expect(probeTarget('srt://10.0.0.5:9000')).toEqual({ host: '10.0.0.5', port: 9000 })
    expect(probeTarget('192.168.1.20:5961')).toEqual({ host: '192.168.1.20', port: 5961 })
  })

  it('returns null for an NDI source name, which is not probeable by socket', () => {
    expect(probeTarget('STUDIO-PC (Court Wide)')).toBeNull()
    expect(probeTarget('')).toBeNull()
    expect(probeTarget('   ')).toBeNull()
  })
})
