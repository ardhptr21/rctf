import {
  AdminPlayerRole,
  AdminPlayerStatus,
  type GetAdminPlayersRouteV2,
  type RouteResponseData,
} from '@rctf/types'
import { filterFingerprint, type MultiFilter } from '$lib/filters/core'
import type { AdminPlayersQueryParams } from '$lib/query/keys'

export type AdminPlayer = RouteResponseData<
  typeof GetAdminPlayersRouteV2
>['players'][number]

export const PAGE_SIZE = 100
export const ROW_HEIGHT = 48

export const ROLE_VALUES: readonly AdminPlayerRole[] = [
  AdminPlayerRole.CAPTAIN,
  AdminPlayerRole.MEMBER,
  AdminPlayerRole.NO_TEAM,
]

export const STATUS_VALUES: readonly AdminPlayerStatus[] = [
  AdminPlayerStatus.ACTIVE,
  AdminPlayerStatus.BANNED,
]

export function statusLabel(status: AdminPlayerStatus): string {
  return status === AdminPlayerStatus.BANNED ? 'Banned' : 'Active'
}

export function playerRole(player: AdminPlayer): AdminPlayerRole {
  if (!player.team) return AdminPlayerRole.NO_TEAM
  return player.isCaptain ? AdminPlayerRole.CAPTAIN : AdminPlayerRole.MEMBER
}

export function roleLabel(role: AdminPlayerRole): string {
  switch (role) {
    case AdminPlayerRole.CAPTAIN:
      return 'Captain'
    case AdminPlayerRole.MEMBER:
      return 'Member'
    case AdminPlayerRole.NO_TEAM:
      return 'No team'
  }
}

export function playerName(player: AdminPlayer): string {
  return player.displayName || player.discordUsername
}

// The values to ask the server for, or undefined for all of them. An
// "is not" filter is sent as the values it leaves.
function effectiveValues<T>(
  filter: MultiFilter<T>,
  all: readonly T[]
): T[] | undefined {
  if (filter.selected.length === 0) return undefined
  if (filter.mode === 'include') return [...filter.selected]
  return all.filter(value => !filter.selected.includes(value))
}

export function effectiveRoles(
  filter: MultiFilter<AdminPlayerRole>
): AdminPlayerRole[] | undefined {
  return effectiveValues(filter, ROLE_VALUES)
}

export function effectiveStatuses(
  filter: MultiFilter<AdminPlayerStatus>
): AdminPlayerStatus[] | undefined {
  return effectiveValues(filter, STATUS_VALUES)
}

export type PlayerFilters = {
  roles: MultiFilter<AdminPlayerRole>
  statuses: MultiFilter<AdminPlayerStatus>
}

export function playerQueryParams(
  filters: PlayerFilters,
  search: string
): AdminPlayersQueryParams {
  const trimmed = search.trim()
  const roles = effectiveRoles(filters.roles)
  const statuses = effectiveStatuses(filters.statuses)
  return {
    limit: PAGE_SIZE,
    ...(trimmed ? { search: trimmed.slice(0, 100) } : {}),
    ...(roles ? { roles: roles.join(',') } : {}),
    ...(statuses ? { statuses: statuses.join(',') } : {}),
  }
}

// An "is not" filter that excludes every value can match nobody, so the
// page shows an empty list without asking the server.
export function filtersMatchNothing(filters: PlayerFilters): boolean {
  return (
    effectiveRoles(filters.roles)?.length === 0 ||
    effectiveStatuses(filters.statuses)?.length === 0
  )
}

export function playerFingerprint(
  filters: PlayerFilters,
  search: string
): string {
  return JSON.stringify([
    filterFingerprint(filters.roles, role => role),
    filterFingerprint(filters.statuses, status => status),
    search.trim(),
  ])
}
