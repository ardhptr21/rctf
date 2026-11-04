import { ExposeKind, InstanceHistoryStatus } from '@rctf/types'
import { describe, expect, it } from 'bun:test'
import {
  formatBytes,
  formatDurationMs,
  formatLifetime,
  hasHttpEndpoint,
  instanceQueryParams,
  PAGE_SIZE,
  requestDetails,
  statusClassTone,
  statusTone,
  type AdminInstance,
  type InstanceRequest,
} from '$routes/admin/instances/instances-model'

describe('formatLifetime', () => {
  const start = '2026-05-05T10:00:00.000Z'

  it('measures to the end, or to now while running', () => {
    expect(formatLifetime(start, '2026-05-05T11:12:30.000Z', 0)).toBe('1h, 12m')
    expect(formatLifetime(start, null, Date.parse(start) + 45_000)).toBe('45s')
    expect(formatLifetime(start, '2026-05-07T10:05:00.000Z', 0)).toBe('2d, 5m')
  })
})

describe('statusTone', () => {
  it('marks running, ended, lost and failed instances apart', () => {
    expect(statusTone(InstanceHistoryStatus.RUNNING)).toBe('success')
    expect(statusTone(InstanceHistoryStatus.STOPPED)).toBe('muted')
    expect(statusTone(InstanceHistoryStatus.SOLVED)).toBe('info')
    expect(statusTone(InstanceHistoryStatus.EXPIRED)).toBe('muted')
    expect(statusTone(InstanceHistoryStatus.GONE)).toBe('warning')
    expect(statusTone(InstanceHistoryStatus.ERRORED)).toBe('danger')
  })
})

describe('instanceQueryParams', () => {
  it('sends only the filters in use', () => {
    expect(
      instanceQueryParams({
        status: 'all',
        category: null,
        teamId: null,
        search: '  ',
      })
    ).toEqual({ limit: PAGE_SIZE })
  })

  it('turns each filter into an include list', () => {
    expect(
      instanceQueryParams({
        status: InstanceHistoryStatus.EXPIRED,
        category: 'web',
        teamId: 'team-1',
        search: ' alpha ',
      })
    ).toEqual({
      limit: PAGE_SIZE,
      search: 'alpha',
      status: { include: [InstanceHistoryStatus.EXPIRED] },
      category: { include: ['web'] },
      team: { include: ['team-1'] },
    })
  })
})

describe('request helpers', () => {
  it('colours a response by its status class', () => {
    expect(statusClassTone(204)).toBe('success')
    expect(statusClassTone(301)).toBe('info')
    expect(statusClassTone(404)).toBe('warning')
    expect(statusClassTone(502)).toBe('danger')
  })

  it('formats sizes and times', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatDurationMs(12)).toBe('12 ms')
    expect(formatDurationMs(1500)).toBe('1.50 s')
  })

  it('knows which instances can have request logs', () => {
    const withKinds = (...kinds: ExposeKind[]) =>
      ({
        endpoints: kinds.map(kind => ({ kind, host: 'h', port: 1 })),
      }) as AdminInstance
    expect(hasHttpEndpoint(withKinds(ExposeKind.HTTPS))).toBe(true)
    expect(hasHttpEndpoint(withKinds(ExposeKind.TCP_SSL))).toBe(false)
    expect(
      hasHttpEndpoint(withKinds(ExposeKind.TCP_SSL, ExposeKind.HTTP))
    ).toBe(true)
  })
})

describe('requestDetails', () => {
  const request: InstanceRequest = {
    id: '981',
    at: '2026-11-04T12:08:00.000Z',
    clientIp: '10.125.152.168',
    method: 'POST',
    host: 'web-3f9c1a.inst.hackme.web.id',
    path: '/login?next=%2Fadmin',
    status: 200,
    bytes: 437,
    durationMs: 0,
    userAgent: 'curl/8.5.0',
  }
  const byLabel = (details: ReturnType<typeof requestDetails>) =>
    Object.fromEntries(details.map(detail => [detail.label, detail.value]))

  it('lists everything kept about the request', () => {
    expect(byLabel(requestDetails(request, 'Nov 4, 7:08 PM'))).toEqual({
      Time: 'Nov 4, 7:08 PM',
      'Time (UTC)': '2026-11-04T12:08:00.000Z',
      'Client IP': '10.125.152.168',
      Method: 'POST',
      Host: 'web-3f9c1a.inst.hackme.web.id',
      Path: '/login?next=%2Fadmin',
      Status: '200',
      'Response size': '437 B',
      'Time taken': '0 ms',
      'User agent': 'curl/8.5.0',
      'Request ID': '981',
    })
  })

  it('shows the time in UTC as ISO 8601', () => {
    const details = byLabel(
      requestDetails({ ...request, at: '2026-11-03 16:55:25.44+00' }, '')
    )
    expect(details['Time (UTC)']).toBe('2026-11-03T16:55:25.440Z')
  })

  it('gives the exact size of larger responses', () => {
    const details = byLabel(requestDetails({ ...request, bytes: 5120 }, ''))
    expect(details['Response size']).toBe('5.0 KB (5,120 bytes)')
  })

  it('says when no user agent was sent', () => {
    const details = requestDetails({ ...request, userAgent: null }, '')
    expect(details.find(detail => detail.label === 'User agent')).toEqual({
      label: 'User agent',
      value: 'Not sent',
      code: false,
    })
  })
})
