import { ExposeKind } from '@rctf/types'
import { describe, expect, it } from 'bun:test'
import {
  activitySummary,
  decodeChunk,
  hasTcpEndpoint,
  renderHex,
  renderText,
  sessionDetails,
  transcriptToText,
  type AdminInstance,
  type InstanceSession,
} from '$routes/admin/instances/instances-model'

const bytes = (...values: number[]) => Uint8Array.from(values)
const b64 = (text: string) => Buffer.from(text, 'latin1').toString('base64')

const session = (
  overrides: Partial<InstanceSession> = {}
): InstanceSession => ({
  id: '311',
  startedAt: '2026-05-05 10:12:00+00',
  durationMs: 8400,
  open: false,
  clientIp: '203.0.113.42',
  host: 'pwn-1.inst.example.com',
  bytesIn: 5,
  bytesOut: 2048,
  truncated: false,
  error: null,
  transcript: [
    { dir: 'out', t: 0, data: b64('hello\n') },
    { dir: 'in', t: 1200, data: b64('flag\n') },
  ],
  ...overrides,
})

const instance = (
  endpoints: AdminInstance['endpoints'],
  counts: { requestCount?: number; sessionCount?: number } = {}
) =>
  ({
    endpoints,
    requestCount: counts.requestCount ?? 0,
    sessionCount: counts.sessionCount ?? 0,
  }) as AdminInstance

describe('renderText', () => {
  it('keeps printable text, newlines and tabs', () => {
    expect(renderText(new TextEncoder().encode('ls -la\n\tok'))).toBe(
      'ls -la\n\tok'
    )
  })

  it('escapes everything else, backslashes included', () => {
    expect(renderText(bytes(0x00, 0x41, 0xff, 0x0d, 0x5c))).toBe(
      '\\x00A\\xff\\x0d\\\\'
    )
  })
})

describe('renderHex', () => {
  it('prints 16 bytes a line with offsets and characters', () => {
    const data = new TextEncoder().encode('ABCDEFGHIJKLMNOPQR')
    expect(renderHex(data).split('\n')).toEqual([
      '00000000  41 42 43 44 45 46 47 48 49 4a 4b 4c 4d 4e 4f 50  ABCDEFGHIJKLMNOP',
      '00000010  51 52                                            QR',
    ])
  })

  it('shows non-printable bytes as dots', () => {
    expect(renderHex(bytes(0x00, 0x7f, 0x20))).toBe(
      '00000000  00 7f 20' + ' '.repeat(39) + '  .. '
    )
  })
})

describe('decodeChunk', () => {
  it('decodes base64 and tolerates garbage', () => {
    expect(Array.from(decodeChunk(b64('\x00\xff')))).toEqual([0, 255])
    expect(decodeChunk('###').length).toBe(0)
  })
})

describe('transcriptToText', () => {
  it('labels who sent each chunk and when', () => {
    expect(transcriptToText(session(), 'text')).toBe(
      '<<< challenge +0.00s\nhello\n\n\n>>> client +1.20s\nflag\n'
    )
  })
})

describe('sessionDetails', () => {
  it('lists what is known about a connection', () => {
    const rows = sessionDetails(session(), 'local')
    expect(rows.map(row => row.label)).toEqual([
      'Opened',
      'Opened (UTC)',
      'Client IP',
      'Host',
      'Duration',
      'Client sent',
      'Challenge sent',
      'Connection ID',
    ])
    expect(rows[1]?.value).toBe('2026-05-05T10:12:00.000Z')
    expect(rows[6]?.value).toBe('2.0 KB (2,048 bytes)')
  })

  it('notes an open, truncated or failed connection', () => {
    const rows = sessionDetails(
      session({ open: true, truncated: true, error: 'instance stopped' }),
      'local'
    )
    expect(rows.find(row => row.label === 'Duration')?.value).toBe(
      '8.40 s so far, still open'
    )
    expect(rows.some(row => row.label === 'Transcript')).toBe(true)
    expect(rows.find(row => row.label === 'Error')?.value).toBe(
      'instance stopped'
    )
  })
})

describe('activitySummary', () => {
  const tcp = { kind: ExposeKind.TCP_SSL, host: 'a', port: 1337 }
  const web = { kind: ExposeKind.HTTPS, host: 'b', port: 443 }

  it('counts what each endpoint kind can log', () => {
    expect(activitySummary(instance([tcp], { sessionCount: 3 }))).toBe(
      '3 connections'
    )
    expect(activitySummary(instance([web], { requestCount: 1 }))).toBe(
      '1 request'
    )
    expect(
      activitySummary(
        instance([web, tcp], { requestCount: 2, sessionCount: 1 })
      )
    ).toBe('2 requests, 1 connection')
    expect(activitySummary(instance([]))).toBe('0 requests')
  })

  it('detects TCP endpoints', () => {
    expect(hasTcpEndpoint(instance([tcp]))).toBe(true)
    expect(hasTcpEndpoint(instance([web]))).toBe(false)
  })
})
