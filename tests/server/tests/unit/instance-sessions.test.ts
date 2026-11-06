import { describe, expect, test } from 'bun:test'
import { parseTcpSession } from '../../../../apps/api/src/services/instance-sessions'

const b64 = (text: string) => Buffer.from(text).toString('base64')

const record = (overrides: Record<string, unknown> = {}) => ({
  kind: 'tcp-session',
  id: '5f2c0e1a9b8d4c3e',
  host: 'Pwn-1.Inst.Example.com',
  clientIp: '203.0.113.42',
  clientPort: 40000,
  startedAt: '2026-05-05T10:00:00.123+00:00',
  durationMs: 8400,
  bytesIn: 5,
  bytesOut: 11,
  truncated: false,
  open: false,
  error: null,
  transcript: [
    { dir: 'out', t: 0, data: b64('hello\n') },
    { dir: 'in', t: 1200, data: b64('flag\n') },
  ],
  ...overrides,
})

describe('parseTcpSession', () => {
  test('maps a tcplog record', () => {
    expect(parseTcpSession(record())).toEqual({
      sessionKey: '5f2c0e1a9b8d4c3e',
      host: 'pwn-1.inst.example.com',
      clientIp: '203.0.113.42',
      startedAt: '2026-05-05T10:00:00.123Z',
      durationMs: 8400,
      open: false,
      bytesIn: 5,
      bytesOut: 11,
      truncated: false,
      error: null,
      transcript: [
        { dir: 'out', t: 0, data: b64('hello\n') },
        { dir: 'in', t: 1200, data: b64('flag\n') },
      ],
    })
  })

  test('rejects anything that is not a connection record', () => {
    expect(parseTcpSession({ RequestHost: 'a' })).toBeNull()
    expect(parseTcpSession(record({ kind: 'other' }))).toBeNull()
    expect(parseTcpSession(record({ id: '' }))).toBeNull()
    expect(parseTcpSession(record({ id: 'has spaces' }))).toBeNull()
    expect(parseTcpSession(record({ startedAt: 'yesterday' }))).toBeNull()
    expect(parseTcpSession(record({ bytesIn: -1 }))).toBeNull()
    expect(parseTcpSession(record({ open: 'no' }))).toBeNull()
  })

  test('rejects a malformed transcript', () => {
    const chunk = (overrides: Record<string, unknown>) =>
      record({
        transcript: [{ dir: 'in', t: 0, data: b64('x'), ...overrides }],
      })
    expect(parseTcpSession(chunk({ dir: 'up' }))).toBeNull()
    expect(parseTcpSession(chunk({ t: -5 }))).toBeNull()
    expect(parseTcpSession(chunk({ data: 'not base64!' }))).toBeNull()
    expect(parseTcpSession(chunk({ data: 'abc' }))).toBeNull()
    expect(parseTcpSession(record({ transcript: 'hi' }))).toBeNull()
  })

  test('drops transcript past 64 KB a direction and marks it truncated', () => {
    const big = b64('A'.repeat(48 * 1024))
    const parsed = parseTcpSession(
      record({
        transcript: [
          { dir: 'in', t: 0, data: big },
          { dir: 'out', t: 1, data: big },
          { dir: 'in', t: 2, data: big },
        ],
      })
    )
    expect(parsed?.truncated).toBe(true)
    expect(parsed?.transcript.map(chunk => chunk.dir)).toEqual(['in', 'out'])
  })

  test('keeps a short error', () => {
    expect(
      parseTcpSession(record({ error: 'x'.repeat(500) }))?.error
    ).toHaveLength(200)
    expect(parseTcpSession(record({ error: '' }))?.error).toBeNull()
  })
})
