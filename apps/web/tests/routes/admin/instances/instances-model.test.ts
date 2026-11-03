import { InstanceHistoryStatus } from '@rctf/types'
import { describe, expect, it } from 'bun:test'
import {
  formatLifetime,
  instanceQueryParams,
  PAGE_SIZE,
  statusTone,
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
