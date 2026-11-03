import { describe, expect, test } from 'bun:test'
import { parseTraefikAccessLog } from '../../../../apps/api/src/services/instance-requests'

const line = (overrides: Record<string, unknown> = {}) => ({
  StartUTC: '2026-05-05T10:00:00.123456789Z',
  ClientHost: '203.0.113.42',
  RequestHost: 'Web-1.Inst.Example.com:443',
  RequestMethod: 'POST',
  RequestPath: '/login?next=/',
  DownstreamStatus: 302,
  DownstreamContentSize: 0,
  Duration: 4_500_000,
  'request_User-Agent': 'Mozilla/5.0',
  ...overrides,
})

describe('parseTraefikAccessLog', () => {
  test('maps an access log line', () => {
    expect(parseTraefikAccessLog(line())).toEqual({
      at: '2026-05-05T10:00:00.123Z',
      clientIp: '203.0.113.42',
      method: 'POST',
      host: 'web-1.inst.example.com',
      path: '/login?next=/',
      status: 302,
      bytes: 0,
      // nanoseconds, rounded to milliseconds
      durationMs: 5,
      userAgent: 'Mozilla/5.0',
    })
  })

  test('caps long paths and user agents', () => {
    const parsed = parseTraefikAccessLog(
      line({
        RequestPath: `/${'a'.repeat(5000)}`,
        'request_User-Agent': 'u'.repeat(1000),
      })
    )
    expect(parsed!.path.length).toBe(2048)
    expect(parsed!.userAgent!.length).toBe(512)
  })

  test('leaves out what is missing', () => {
    expect(
      parseTraefikAccessLog(
        line({ 'request_User-Agent': undefined, Duration: undefined })
      )
    ).toMatchObject({ userAgent: null, durationMs: 0 })
  })

  test('ignores lines that are not HTTP requests', () => {
    expect(parseTraefikAccessLog({ level: 'info', msg: 'started' })).toBeNull()
    expect(parseTraefikAccessLog(line({ RequestHost: '' }))).toBeNull()
    expect(parseTraefikAccessLog(line({ DownstreamStatus: '200' }))).toBeNull()
    expect(parseTraefikAccessLog(line({ StartUTC: 'yesterday' }))).toBeNull()
  })
})
