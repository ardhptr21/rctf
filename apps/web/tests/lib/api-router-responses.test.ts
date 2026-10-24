import {
  BadNoTeam,
  BadNotCaptain,
  GetChallengesRouteV2,
  GetUserSelfRouteV2,
} from '@rctf/types'
import { beforeAll, describe, expect, mock, test } from 'bun:test'

mock.module('$app/environment', () => ({ browser: false }))

let api!: typeof import('$lib/api')

beforeAll(async () => {
  api = await import('$lib/api')
})

const respondWith = (payload: unknown, status = 200) => {
  api.setApiFetch(
    (async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch
  )
}

describe('apiRequest router responses', () => {
  test('returns 403 badNoTeam instead of throwing', async () => {
    respondWith({ kind: BadNoTeam.kind, message: BadNoTeam.message }, 403)
    const response = await api.apiRequest(GetUserSelfRouteV2)
    expect(response.kind).toBe(BadNoTeam.kind)
  })

  test('accepts router responses on routes that do not list them', async () => {
    respondWith(
      { kind: BadNotCaptain.kind, message: BadNotCaptain.message },
      403
    )
    const response = await api.apiRequest(GetChallengesRouteV2)
    expect(response.kind as string).toBe(BadNotCaptain.kind)
  })

  test('still throws on a truly unknown response kind', async () => {
    respondWith({ kind: 'badSomethingElse', message: 'nope' }, 400)
    await expect(api.apiRequest(GetUserSelfRouteV2)).rejects.toThrow(
      'Unknown response kind'
    )
  })
})
