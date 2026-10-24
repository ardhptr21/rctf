import {
  BadNoTeam,
  GoodMemberData,
  GoodUserDataV2,
  GoodUserSelfDataV2,
} from '@rctf/types'
import { hashKey, QueryClient, QueryObserver } from '@tanstack/svelte-query'
import { queryKeys } from '$lib/query/keys'
import { beforeAll, describe, expect, mock, test } from 'bun:test'

mock.module('$app/environment', () => ({ browser: false }))

let apiResponse: unknown = null
let apiCalls = 0
mock.module('$lib/api', () => ({
  apiRequest: async () => {
    apiCalls++
    return apiResponse
  },
  isAuthenticated: () => true,
}))

let user!: typeof import('$lib/query/user')

beforeAll(async () => {
  user = await import('$lib/query/user')
})

function runQueryFn<T>(options: { queryFn?: unknown }): Promise<T> {
  const fn = options.queryFn
  if (typeof fn !== 'function') {
    throw new Error('expected a callable queryFn')
  }
  return fn(undefined) as Promise<T>
}

describe('userByIdQueryOptions', () => {
  test('distinct users produce distinct cache keys', () => {
    const keys = ['team-a', 'team-b', 'team-c'].map(id =>
      hashKey(queryKeys.userById(id))
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('returns the data on a good response', async () => {
    apiResponse = { kind: GoodUserDataV2.kind, data: { id: 'team-a' } }
    const result = await runQueryFn(user.userByIdQueryOptions('team-a'))
    expect(result).toEqual({ id: 'team-a' })
  })

  test('throws on a bad response', async () => {
    apiResponse = { kind: 'badUnknownUser', message: 'No such user.' }
    await expect(
      runQueryFn(user.userByIdQueryOptions('team-a'))
    ).rejects.toThrow('No such user.')
  })
})

describe('membersQueryOptions', () => {
  test('disabled when the userMembers config flag is off', () => {
    expect(user.membersQueryOptions(false).enabled).toBe(false)
  })

  test('enabled when the userMembers config flag is on', () => {
    expect(user.membersQueryOptions(true).enabled).toBe(true)
  })

  test('returns the member list on a good response', async () => {
    const members = [{ id: 'm1', userid: 'u1', email: 'a@b.co' }]
    apiResponse = { kind: GoodMemberData.kind, data: members }
    const result = await runQueryFn(user.membersQueryOptions(true))
    expect(result).toEqual(members)
  })
})

describe('userSelfQueryOptions', () => {
  const noTeam = {
    kind: BadNoTeam.kind,
    message: BadNoTeam.message,
  }

  // TanStack options may be a value or a function of the query
  const resolve = (option: unknown, query: unknown): unknown =>
    typeof option === 'function'
      ? (option as (query: unknown) => unknown)(query)
      : option

  test('a player without a team (403 badNoTeam) is fetched once and never polled', async () => {
    apiResponse = noTeam
    apiCalls = 0
    const client = new QueryClient()

    expect(await client.fetchQuery(user.userSelfQueryOptions)).toBeNull()
    expect(apiCalls).toBe(1)

    const query = client
      .getQueryCache()
      .find({ queryKey: user.userSelfQueryOptions.queryKey })!
    const options = user.userSelfQueryOptions
    expect(resolve(options.refetchInterval, query)).toBe(false)
    expect(resolve(options.staleTime, query)).toBe(Infinity)
    expect(options.retry).toBe(false)

    // mounting more components or prefetching again does not refetch
    const observer = new QueryObserver(client, user.userSelfQueryOptions)
    const unsubscribe = observer.subscribe(() => {})
    await client.prefetchQuery(user.userSelfQueryOptions)
    await new Promise(resolve => setTimeout(resolve, 10))
    unsubscribe()
    expect(apiCalls).toBe(1)
    client.clear()
  })

  test('a team member is still polled', async () => {
    apiResponse = { kind: GoodUserSelfDataV2.kind, data: { id: 'team-a' } }
    const client = new QueryClient()
    await client.fetchQuery(user.userSelfQueryOptions)

    const query = client
      .getQueryCache()
      .find({ queryKey: user.userSelfQueryOptions.queryKey })!
    const options = user.userSelfQueryOptions
    expect(resolve(options.refetchInterval, query)).toBe(30_000)
    expect(resolve(options.staleTime, query)).toBe(5 * 60 * 1000)
    client.clear()
  })

  test('the helpers only poll when there is a team', () => {
    expect(user.userSelfPollInterval(null)).toBe(false)
    expect(user.userSelfPollInterval({ id: 'team-a' })).toBe(30_000)
    expect(user.userSelfStaleTime(null)).toBe(Infinity)
  })
})
