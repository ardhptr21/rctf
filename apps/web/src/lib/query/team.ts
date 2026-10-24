import {
  GetPlayerSelfRouteV2,
  GetTeamMembersRouteV2,
  GoodPlayerSelf,
  GoodTeamMembers,
} from '@rctf/types'
import { createQuery, queryOptions } from '@tanstack/svelte-query'
import { apiRequest, getClientConfig, isAuthenticated } from '$lib/api'
import { unwrapData } from '$lib/query/core'
import { queryKeys } from '$lib/query/keys'

// the signed-in Discord player; null for legacy team logins or logged out
export const playerSelfQueryOptions = queryOptions({
  queryKey: queryKeys.playerSelf,
  queryFn: async () => {
    if (!isAuthenticated() || !getClientConfig()?.discord) {
      return null
    }
    const response = await apiRequest(GetPlayerSelfRouteV2)
    if (response.kind === GoodPlayerSelf.kind) {
      return response.data
    }
    return null
  },
  staleTime: 1000 * 60 * 5,
})

export function usePlayerSelf() {
  return createQuery(() => playerSelfQueryOptions)
}

export function useTeamMembers(enabled: () => boolean) {
  return createQuery(() => ({
    queryKey: queryKeys.teamMembers,
    queryFn: async () => {
      const response = await apiRequest(GetTeamMembersRouteV2)
      return unwrapData(response, GoodTeamMembers)
    },
    enabled: enabled(),
  }))
}
