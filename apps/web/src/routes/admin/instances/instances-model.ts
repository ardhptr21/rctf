import {
  InstanceHistoryStatus,
  type FilterAdminInstancesRouteV2,
  type RouteResponseData,
} from '@rctf/types'
import type { AdminInstancesQueryParams } from '$lib/query/keys'
import { intervalToDuration } from '$lib/utils/time'

export type AdminInstancesPage = RouteResponseData<
  typeof FilterAdminInstancesRouteV2
>
export type AdminInstance = AdminInstancesPage['instances'][number]

export const PAGE_SIZE = 50
export const ROW_HEIGHT = 52

export type StatusTab = InstanceHistoryStatus | 'all'

export const STATUS_TABS: readonly { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: InstanceHistoryStatus.RUNNING, label: 'Running' },
  { value: InstanceHistoryStatus.STOPPED, label: 'Stopped' },
  { value: InstanceHistoryStatus.SOLVED, label: 'Solved' },
  { value: InstanceHistoryStatus.EXPIRED, label: 'Expired' },
  { value: InstanceHistoryStatus.GONE, label: 'Gone' },
  { value: InstanceHistoryStatus.ERRORED, label: 'Errored' },
]

export const STATUS_LABEL: Record<InstanceHistoryStatus, string> = {
  [InstanceHistoryStatus.RUNNING]: 'Running',
  [InstanceHistoryStatus.STOPPED]: 'Stopped',
  [InstanceHistoryStatus.SOLVED]: 'Solved',
  [InstanceHistoryStatus.EXPIRED]: 'Expired',
  [InstanceHistoryStatus.GONE]: 'Gone',
  [InstanceHistoryStatus.ERRORED]: 'Errored',
}

export const STATUS_HINT: Record<InstanceHistoryStatus, string> = {
  [InstanceHistoryStatus.RUNNING]: 'Still running',
  [InstanceHistoryStatus.STOPPED]: 'The team stopped it',
  [InstanceHistoryStatus.SOLVED]:
    'Stopped automatically when the team solved the challenge',
  [InstanceHistoryStatus.EXPIRED]: 'Its time ran out',
  [InstanceHistoryStatus.GONE]:
    'The instancer no longer had it, for example it crashed or was removed',
  [InstanceHistoryStatus.ERRORED]: 'The instancer reported an error',
}

export type StatusTone = 'success' | 'info' | 'muted' | 'warning' | 'danger'

export function statusTone(status: InstanceHistoryStatus): StatusTone {
  switch (status) {
    case InstanceHistoryStatus.RUNNING:
      return 'success'
    case InstanceHistoryStatus.SOLVED:
      return 'info'
    case InstanceHistoryStatus.STOPPED:
    case InstanceHistoryStatus.EXPIRED:
      return 'muted'
    case InstanceHistoryStatus.GONE:
      return 'warning'
    case InstanceHistoryStatus.ERRORED:
      return 'danger'
  }
}

// How long it ran, or has run so far: "1h, 12m", "45s".
export function formatLifetime(
  startedAt: string,
  endedAt: string | null,
  now: number
): string {
  const end = endedAt ? Date.parse(endedAt) : now
  const { days, hours, minutes, seconds } = intervalToDuration(
    end - Date.parse(startedAt)
  )
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  return parts.length > 0 ? parts.join(', ') : `${seconds}s`
}

export function endpointLabel(endpoint: AdminInstance['endpoints'][number]) {
  return `${endpoint.host}:${endpoint.port}`
}

export type InstanceFilters = {
  status: StatusTab
  category: string | null
  teamId: string | null
  search: string
}

// The list request for the filters, without paging.
export function instanceQueryParams(
  filters: InstanceFilters
): AdminInstancesQueryParams {
  const search = filters.search.trim()
  return {
    limit: PAGE_SIZE,
    ...(search ? { search: search.slice(0, 100) } : {}),
    ...(filters.status === 'all'
      ? {}
      : { status: { include: [filters.status] } }),
    ...(filters.category !== null
      ? { category: { include: [filters.category] } }
      : {}),
    ...(filters.teamId !== null ? { team: { include: [filters.teamId] } } : {}),
  }
}
