import { config } from '@rctf/config'
import { createDatabase, solves } from '@rctf/db'
import {
  BadUnknownUser,
  GoodChallengeSolvesV2,
  GoodLeaderboardChallengesV2,
  GoodLeaderboardV2,
  GoodUserDataV2,
  GoodUserSelfDataV2,
  Permissions,
} from '@rctf/types'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Hono } from 'hono'
import { cacheLeaderboardAndGraph } from '../../../../apps/api/src/cache/leaderboard'
import { calculateLeaderboard } from '../../../../apps/api/src/services/leaderboard-calculation'
import { applyDecayPointsForChallenge } from '../../../../apps/api/src/services/solve-points'
import { setUserPerms } from '../../../../apps/api/src/services/users'
import { createRedis } from '../../../../apps/api/src/util/redis'
import { getApp, request } from '../../app'
import {
  clearDatabase,
  expectResponse,
  generateAuthToken,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db
const HOUR = 60 * 60 * 1000

let app: Hono<any>

const insertSolve = async (
  challengeId: string,
  userId: string,
  createdAt: number
) => {
  await getDb()
    .insert(solves)
    .values({
      id: crypto.randomUUID(),
      challengeid: challengeId,
      userid: userId,
      createdat: new Date(createdAt).toISOString(),
    })
}

const authHeaders = async (userId: string) => ({
  Authorization: `Bearer ${await generateAuthToken(userId)}`,
})

const cacheCurrentLeaderboard = async () => {
  const db = getDb()
  await cacheLeaderboardAndGraph(
    db,
    await createRedis(),
    await calculateLeaderboard(db)
  )
}

describe('admin teams are left out of scoring', () => {
  let admin: Awaited<ReturnType<typeof generateRealTestUser>>
  let player: Awaited<ReturnType<typeof generateRealTestUser>>
  let challenge: Awaited<ReturnType<typeof generateChallenge>>
  const now = Date.now()

  // the admin team solves first, so it would otherwise take first blood
  beforeAll(async () => {
    app = await getApp()
    admin = await generateRealTestUser(Permissions.challsRead)
    player = await generateRealTestUser()
    challenge = await generateChallenge()
    await insertSolve(challenge.challenge.id, admin.user.id, now - 2 * HOUR)
    await insertSolve(challenge.challenge.id, player.user.id, now - HOUR)
  })

  afterAll(async () => {
    await challenge.cleanup()
    await admin.cleanup()
    await player.cleanup()
    await clearDatabase()
  })

  test('the standings and solve counts ignore admin solves', async () => {
    const result = await calculateLeaderboard(getDb())
    const ids = result.users.map(user => user.id)
    expect(ids).toContain(player.user.id)
    expect(ids).not.toContain(admin.user.id)
    expect(result.challengeInfos.get(challenge.challenge.id)?.solves).toBe(1)
  })

  test('decay points count only scored solves', async () => {
    const db = getDb()
    const withAdmin = await applyDecayPointsForChallenge(
      db,
      challenge.challenge.id
    )
    // the same challenge priced as if only the player had solved it
    const { challenge: solo, cleanup } = await generateChallenge()
    try {
      await insertSolve(solo.id, player.user.id, now - HOUR)
      const playerOnly = await applyDecayPointsForChallenge(db, solo.id)
      expect(withAdmin.newPoints).toBe(playerOnly.newPoints)
    } finally {
      await cleanup()
    }
  })

  test('public lists, bloods and the scoreboard leave admins out', async () => {
    await cacheCurrentLeaderboard()

    const board = await expectResponse(
      await request(app, '/api/v2/leaderboard/now?limit=100&offset=0', {
        method: 'GET',
      }),
      GoodLeaderboardV2
    )
    const boardIds = board.data.leaderboard.map((e: any) => e.id)
    expect(boardIds).toContain(player.user.id)
    expect(boardIds).not.toContain(admin.user.id)

    const solvers = await expectResponse(
      await request(
        app,
        `/api/v2/challs/${challenge.challenge.id}/solves?limit=10&offset=0`,
        { method: 'GET' }
      ),
      GoodChallengeSolvesV2
    )
    expect(solvers.data.total).toBe(1)
    expect(solvers.data.solves.map((s: any) => s.userId)).toEqual([
      player.user.id,
    ])

    const bloods = await expectResponse(
      await request(app, '/api/v2/leaderboard/challs', { method: 'GET' }),
      GoodLeaderboardChallengesV2
    )
    expect(
      bloods.data.challenges[challenge.challenge.id].firstSolvers.map(
        (s: any) => s.id
      )
    ).toEqual([player.user.id])
  })

  test('an admin team keeps its own solves but has no score or place', async () => {
    await cacheCurrentLeaderboard()
    const me = await expectResponse(
      await request(app, '/api/v2/users/me', {
        method: 'GET',
        headers: await authHeaders(admin.user.id),
      }),
      GoodUserSelfDataV2
    )
    expect(me.data.solves.map((s: any) => s.id)).toEqual([
      challenge.challenge.id,
    ])
    expect(me.data.score).toBe(0)
    expect(me.data.globalPlace).toBeNull()
  })

  test('only the team itself and admins can see an admin team profile', async () => {
    const path = `/api/v2/users/${admin.user.id}`
    await expectResponse(
      await request(app, path, { method: 'GET' }),
      BadUnknownUser
    )
    await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(player.user.id),
      }),
      BadUnknownUser
    )
    await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(admin.user.id),
      }),
      GoodUserDataV2
    )
  })

  test('promoting and demoting a team moves it out of and back into the standings', async () => {
    const db = getDb()
    const redis = await createRedis()
    const rankedIds = async () =>
      (await calculateLeaderboard(db)).users.map(user => user.id)

    await setUserPerms(db, redis, player.user.id, Permissions.challsRead)
    expect(await rankedIds()).not.toContain(player.user.id)

    await setUserPerms(db, redis, player.user.id, 0)
    expect(await rankedIds()).toContain(player.user.id)
  })
})
