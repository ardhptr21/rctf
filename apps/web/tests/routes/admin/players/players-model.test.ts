import { AdminPlayerRole, AdminPlayerStatus } from '@rctf/types'
import type { MultiFilter } from '$lib/filters/core'
import {
  effectiveRoles,
  filtersMatchNothing,
  playerQueryParams,
  playerRole,
  type AdminPlayer,
} from '$routes/admin/players/players-model'
import { describe, expect, test } from 'bun:test'

const filter = <T>(
  mode: 'include' | 'exclude',
  selected: T[]
): MultiFilter<T> => ({ mode, selected })

const noStatus = filter<AdminPlayerStatus>('include', [])

const player = (overrides: Partial<AdminPlayer>): AdminPlayer => ({
  id: 'p1',
  discordId: '1',
  discordUsername: 'nelly',
  displayName: null,
  avatarUrl: null,
  isCaptain: false,
  banned: false,
  team: null,
  joinedTeamAt: null,
  createdAt: 0,
  ...overrides,
})

const team = { id: 't1', name: 'otters', isAdmin: false, banned: false }

describe('playerRole', () => {
  test('derives the role from team and captaincy', () => {
    expect(playerRole(player({}))).toBe(AdminPlayerRole.NO_TEAM)
    expect(playerRole(player({ team }))).toBe(AdminPlayerRole.MEMBER)
    expect(playerRole(player({ team, isCaptain: true }))).toBe(
      AdminPlayerRole.CAPTAIN
    )
  })
})

describe('effectiveRoles', () => {
  test('sends nothing without a filter', () => {
    expect(effectiveRoles(filter('include', []))).toBeUndefined()
  })

  test('sends included roles as they are', () => {
    expect(
      effectiveRoles(filter('include', [AdminPlayerRole.CAPTAIN]))
    ).toEqual([AdminPlayerRole.CAPTAIN])
  })

  test('turns an exclude filter into the remaining roles', () => {
    expect(
      effectiveRoles(filter('exclude', [AdminPlayerRole.NO_TEAM]))
    ).toEqual([AdminPlayerRole.CAPTAIN, AdminPlayerRole.MEMBER])
  })

  test('excluding every role matches nothing', () => {
    const all = filter('exclude', [
      AdminPlayerRole.CAPTAIN,
      AdminPlayerRole.MEMBER,
      AdminPlayerRole.NO_TEAM,
    ])
    expect(filtersMatchNothing({ roles: all, statuses: noStatus })).toBe(true)
    expect(
      filtersMatchNothing({ roles: filter('include', []), statuses: noStatus })
    ).toBe(false)
  })
})

describe('playerQueryParams', () => {
  test('joins roles and trims the search', () => {
    expect(
      playerQueryParams(
        {
          roles: filter('include', [
            AdminPlayerRole.MEMBER,
            AdminPlayerRole.NO_TEAM,
          ]),
          statuses: noStatus,
        },
        '  nelly '
      )
    ).toEqual({ limit: 100, search: 'nelly', roles: 'member,noTeam' })
  })

  test('leaves out an empty search and filter', () => {
    expect(
      playerQueryParams(
        { roles: filter('include', []), statuses: noStatus },
        '   '
      )
    ).toEqual({ limit: 100 })
  })

  test('sends the status filter, turning "is not" into what is left', () => {
    const roles = filter<AdminPlayerRole>('include', [])
    expect(
      playerQueryParams(
        { roles, statuses: filter('include', [AdminPlayerStatus.BANNED]) },
        ''
      )
    ).toEqual({ limit: 100, statuses: 'banned' })
    expect(
      playerQueryParams(
        { roles, statuses: filter('exclude', [AdminPlayerStatus.BANNED]) },
        ''
      )
    ).toEqual({ limit: 100, statuses: 'active' })
  })
})
