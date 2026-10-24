import {
  GetMembersRoute,
  GetUserRouteV2,
  GetUserSelfRouteV2,
  GoodMemberData,
  GoodUserDataV2,
  GoodUserSelfDataV2,
} from '@rctf/types'
import { createQuery, queryOptions } from '@tanstack/svelte-query'
import { apiRequest, isAuthenticated } from '$lib/api'
import { unwrapData } from '$lib/query/core'
import { queryKeys } from '$lib/query/keys'

const USER_SELF_STALE_TIME = 1000 * 60 * 5
const USER_SELF_POLL_INTERVAL = 30 * 1000

// A null result means logged out, or a Discord player without a team (403
// badNoTeam). Polling cannot change that: logging in and joining or creating
// a team reset this query, so it is only refetched then.
export const userSelfPollInterval = (data: unknown): number | false =>
  data ? USER_SELF_POLL_INTERVAL : false

export const userSelfStaleTime = (data: unknown): number =>
  data ? USER_SELF_STALE_TIME : Infinity

export const userSelfQueryOptions = queryOptions({
  queryKey: queryKeys.userSelf,
  queryFn: async () => {
    if (!isAuthenticated()) {
      return null
    }
    const response = await apiRequest(GetUserSelfRouteV2)
    if (response.kind === GoodUserSelfDataV2.kind) {
      return response.data
    }
    return null
  },
  retry: false,
  staleTime: query => userSelfStaleTime(query.state.data),
  refetchInterval: query => userSelfPollInterval(query.state.data),
})

export function useCurrentUser() {
  return createQuery(() => userSelfQueryOptions)
}

export function userByIdQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.userById(id),
    queryFn: async () => {
      const response = await apiRequest(GetUserRouteV2, { id })
      return unwrapData(response, GoodUserDataV2)
    },
  })
}

export function useUserById(id: () => string) {
  return createQuery(() => userByIdQueryOptions(id()))
}

export function membersQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.members,
    queryFn: async () => {
      const response = await apiRequest(GetMembersRoute)
      return unwrapData(response, GoodMemberData)
    },
    enabled,
  })
}

export function useMembers(enabled: () => boolean) {
  return createQuery(() => membersQueryOptions(enabled()))
}
