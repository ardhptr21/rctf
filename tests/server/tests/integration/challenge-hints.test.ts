import { config } from '@rctf/config'
import { challenges, createDatabase } from '@rctf/db'
import {
  BadBody,
  GoodAdminChallengeV2,
  GoodChallengesV2,
  GoodChallengeUpdateV2,
  Permissions,
} from '@rctf/types'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateAuthToken,
  generateRealTestUser,
} from '../../util'

let app: Hono<any>
let adminToken: string
let playerToken: string
const getDb = () => createDatabase(config.database.sql).db

const cleanups: Array<() => Promise<void>> = []
const challengeIds: string[] = []

const baseData = {
  name: 'Hints Test',
  description: 'challenge with hints',
  category: 'misc',
  author: 'tester',
  points: { min: 100, max: 500 },
  flags: [{ provider: 'flags/static', config: { flag: 'flag{hints}' } }],
}

const putChallenge = async (id: string, data: Record<string, unknown>) =>
  request(app, `/api/v2/admin/challs/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ data }),
  })

const newChallengeId = () => {
  const id = crypto.randomUUID()
  challengeIds.push(id)
  return id
}

const playerChallenge = async (id: string) => {
  const body = await expectResponse(
    await request(app, '/api/v2/challs', {
      headers: { Authorization: `Bearer ${playerToken}` },
    }),
    GoodChallengesV2
  )
  return body.data.find((c: any) => c.id === id)
}

beforeAll(async () => {
  app = await getApp()
  const admin = await generateRealTestUser(
    Permissions.challsRead | Permissions.challsWrite
  )
  const player = await generateRealTestUser()
  cleanups.push(admin.cleanup, player.cleanup)
  adminToken = await generateAuthToken(admin.user.id)
  playerToken = await generateAuthToken(player.user.id)
})

afterAll(async () => {
  const db = getDb()
  for (const id of challengeIds) {
    await db.delete(challenges).where(eq(challenges.id, id))
  }
  for (const cleanup of cleanups) {
    await cleanup()
  }
})

describe('challenge hints', () => {
  test('admins save hints and players see them in order', async () => {
    const id = newChallengeId()
    const hints = ['Look at the **headers**.', 'Try `X-Forwarded-For`.']

    const saved = await expectResponse(
      await putChallenge(id, { ...baseData, hints }),
      GoodChallengeUpdateV2
    )
    expect(saved.data.hints).toEqual(hints)

    const admin = await expectResponse(
      await request(app, `/api/v2/admin/challs/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      GoodAdminChallengeV2
    )
    expect(admin.data.hints).toEqual(hints)

    expect((await playerChallenge(id))?.hints).toEqual(hints)
  })

  test('players get an empty list when a challenge has no hints', async () => {
    const id = newChallengeId()
    await expectResponse(
      await putChallenge(id, baseData),
      GoodChallengeUpdateV2
    )
    expect((await playerChallenge(id))?.hints).toEqual([])
  })

  test('an update without hints keeps them, and an empty list clears them', async () => {
    const id = newChallengeId()
    await expectResponse(
      await putChallenge(id, { ...baseData, hints: ['keep me'] }),
      GoodChallengeUpdateV2
    )

    await expectResponse(
      await putChallenge(id, { name: 'Renamed' }),
      GoodChallengeUpdateV2
    )
    expect((await playerChallenge(id))?.hints).toEqual(['keep me'])

    await expectResponse(
      await putChallenge(id, { hints: [] }),
      GoodChallengeUpdateV2
    )
    expect((await playerChallenge(id))?.hints).toEqual([])
  })

  test('rejects empty, overlong and too many hints', async () => {
    const id = newChallengeId()
    for (const hints of [
      [''],
      ['x'.repeat(10_001)],
      Array.from({ length: 21 }, (_, i) => `hint ${i}`),
    ]) {
      await expectResponse(
        await putChallenge(id, { ...baseData, hints }),
        BadBody
      )
    }
  })
})
