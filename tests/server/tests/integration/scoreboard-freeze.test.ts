import { config } from '@rctf/config'
import { createDatabase, scoreEvents, settings, solves } from '@rctf/db'
import {
  BadBody,
  BadPerms,
  GoodAdminSettingsUpdate,
  GoodChallengeSolvesV2,
  GoodLeaderboardGraph,
  GoodLeaderboardChallengesV2,
  GoodLeaderboardV2,
  GoodUserDataV2,
  Permissions,
} from '@rctf/types'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { cacheLeaderboardAndGraph } from '../../../../apps/api/src/cache/leaderboard'
import {
  calculateLeaderboard,
  createCachedLeaderboardCalculator,
} from '../../../../apps/api/src/services/leaderboard-calculation'
import {
  getScoreboardFreezeCutoff,
  invalidateResolvedSettingsCache,
  updateSettings,
} from '../../../../apps/api/src/services/settings'
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

const setFreezeTime = async (scoreboardFreezeTime: number | null) => {
  const redis = await createRedis()
  await updateSettings(getDb(), { scoreboardFreezeTime }, redis)
}

const resetSettings = async () => {
  const redis = await createRedis()
  await getDb().delete(settings).where(eq(settings.id, 'value-0'))
  await invalidateResolvedSettingsCache(redis)
}

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
  const redis = await createRedis()
  await cacheLeaderboardAndGraph(db, redis, await calculateLeaderboard(db))
}

beforeAll(async () => {
  app = await getApp()
})

afterEach(async () => {
  await resetSettings()
})

afterAll(async () => {
  await resetSettings()
  await clearDatabase()
})

describe('getScoreboardFreezeCutoff', () => {
  const timing = { startTime: 1_000, endTime: 10_000 }

  test('is null without a freeze time', () => {
    expect(
      getScoreboardFreezeCutoff(
        { ...timing, scoreboardFreezeTime: null },
        5_000
      )
    ).toBeNull()
  })

  test('is null before the freeze starts', () => {
    expect(
      getScoreboardFreezeCutoff(
        { ...timing, scoreboardFreezeTime: 5_000 },
        4_999
      )
    ).toBeNull()
  })

  test('returns the freeze time while frozen', () => {
    expect(
      getScoreboardFreezeCutoff(
        { ...timing, scoreboardFreezeTime: 5_000 },
        5_000
      )
    ).toBe(5_000)
    expect(
      getScoreboardFreezeCutoff(
        { ...timing, scoreboardFreezeTime: 5_000 },
        9_999
      )
    ).toBe(5_000)
  })

  test('stays frozen after the competition ends', () => {
    expect(
      getScoreboardFreezeCutoff(
        { ...timing, scoreboardFreezeTime: 5_000 },
        10_000
      )
    ).toBe(5_000)
    expect(
      getScoreboardFreezeCutoff(
        { ...timing, scoreboardFreezeTime: 5_000 },
        50_000
      )
    ).toBe(5_000)
  })

  test('ignores a freeze time at or after the end time', () => {
    expect(
      getScoreboardFreezeCutoff(
        { ...timing, scoreboardFreezeTime: 10_000 },
        10_000
      )
    ).toBeNull()
  })
})

describe('scoreboard freeze', () => {
  let early: Awaited<ReturnType<typeof generateRealTestUser>>
  let late: Awaited<ReturnType<typeof generateRealTestUser>>
  let admin: Awaited<ReturnType<typeof generateRealTestUser>>
  let challenge: Awaited<ReturnType<typeof generateChallenge>>
  const now = Date.now()
  const freezeTime = now - HOUR

  beforeAll(async () => {
    early = await generateRealTestUser()
    late = await generateRealTestUser()
    admin = await generateRealTestUser(
      Permissions.challsRead | Permissions.leaderboardRead
    )
    challenge = await generateChallenge()
    await insertSolve(challenge.challenge.id, early.user.id, now - 2 * HOUR)
    await insertSolve(challenge.challenge.id, late.user.id, now - HOUR / 2)
  })

  afterAll(async () => {
    await challenge.cleanup()
    await early.cleanup()
    await late.cleanup()
    await admin.cleanup()
  })

  test('the frozen leaderboard ignores solves after the freeze', async () => {
    await setFreezeTime(freezeTime)
    const result = await calculateLeaderboard(getDb())

    expect(result.users.map(user => user.id)).toEqual([early.user.id])
    expect(result.challengeInfos.get(challenge.challenge.id)?.solves).toBe(1)
  })

  test('live standings still include every solve', async () => {
    await setFreezeTime(freezeTime)
    const result = await calculateLeaderboard(getDb(), undefined, {
      ignoreFreeze: true,
    })

    expect(result.users.map(user => user.id).sort()).toEqual(
      [early.user.id, late.user.id].sort()
    )
    expect(result.challengeInfos.get(challenge.challenge.id)?.solves).toBe(2)
  })

  test('the leaderboard stays frozen after the CTF ends', async () => {
    const redis = await createRedis()
    // the late solve lands between the freeze and the end
    await updateSettings(
      getDb(),
      {
        scoreboardFreezeTime: now - 2 * HOUR + 1,
        endTime: now - HOUR / 4,
      },
      redis
    )
    const frozen = await calculateLeaderboard(getDb())
    expect(frozen.users.map(user => user.id)).toEqual([early.user.id])

    // clearing the freeze reveals the final standings
    await updateSettings(getDb(), { scoreboardFreezeTime: null }, redis)
    const revealed = await calculateLeaderboard(getDb())
    expect(revealed.users.map(user => user.id).sort()).toEqual(
      [early.user.id, late.user.id].sort()
    )
  })

  test('the cached calculator rebuilds when the freeze is lifted', async () => {
    const calculate = createCachedLeaderboardCalculator()
    await setFreezeTime(freezeTime)
    const frozen = await calculate(getDb())
    expect(frozen.calculated.users).toHaveLength(1)

    await setFreezeTime(null)
    const live = await calculate(getDb())
    expect(live.recomputedFromScratch).toBe(true)
    expect(live.calculated.users).toHaveLength(2)
  })

  test('solver lists hide post-freeze solves from other teams', async () => {
    await setFreezeTime(freezeTime)
    const path = `/api/v2/challs/${challenge.challenge.id}/solves?limit=10&offset=0`

    const anonymous = await expectResponse(
      await request(app, path, { method: 'GET' }),
      GoodChallengeSolvesV2
    )
    expect(anonymous.data.solves.map((s: any) => s.userId)).toEqual([
      early.user.id,
    ])

    const own = await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(late.user.id),
      }),
      GoodChallengeSolvesV2
    )
    expect(own.data.solves.map((s: any) => s.userId)).toContain(late.user.id)
    expect(own.data.mySolvePosition).not.toBeNull()

    const asAdmin = await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(admin.user.id),
      }),
      GoodChallengeSolvesV2
    )
    expect(asAdmin.data.total).toBe(2)
  })

  test('profiles hide post-freeze solves except from the owner', async () => {
    await setFreezeTime(freezeTime)
    const path = `/api/v2/users/${late.user.id}`

    const anonymous = await expectResponse(
      await request(app, path, { method: 'GET' }),
      GoodUserDataV2
    )
    expect(anonymous.data.solves).toHaveLength(0)

    const own = await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(late.user.id),
      }),
      GoodUserDataV2
    )
    expect(own.data.solves).toHaveLength(1)
  })

  test('first bloods on the scoreboard respect the freeze', async () => {
    await setFreezeTime(freezeTime)
    const body = await expectResponse(
      await request(app, '/api/v2/leaderboard/challs', { method: 'GET' }),
      GoodLeaderboardChallengesV2
    )
    expect(
      body.data.challenges[challenge.challenge.id].firstSolvers.map(
        (s: any) => s.id
      )
    ).toEqual([early.user.id])
  })

  test('the public leaderboard shows frozen standings', async () => {
    await setFreezeTime(freezeTime)
    await cacheCurrentLeaderboard()

    const body = await expectResponse(
      await request(app, '/api/v2/leaderboard/now?limit=10&offset=0', {
        method: 'GET',
      }),
      GoodLeaderboardV2
    )
    expect(body.data.leaderboard.map((e: any) => e.id)).toEqual([early.user.id])
  })

  test('the graph stops at the freeze', async () => {
    const db = getDb()
    const eventIds = [crypto.randomUUID(), crypto.randomUUID()]
    await db.insert(scoreEvents).values([
      {
        id: eventIds[0]!,
        challengeid: challenge.challenge.id,
        userid: early.user.id,
        pointsDelta: 500,
        eventAt: new Date(now - 2 * HOUR).toISOString(),
        source: 'flag',
      },
      {
        id: eventIds[1]!,
        challengeid: challenge.challenge.id,
        userid: early.user.id,
        pointsDelta: 77,
        eventAt: new Date(now - HOUR / 2).toISOString(),
        source: 'flag',
      },
    ])

    const graphScores = async () => {
      await cacheCurrentLeaderboard()
      const body = await expectResponse(
        await request(app, '/api/v2/leaderboard/graph?limit=10&offset=0', {
          method: 'GET',
        }),
        GoodLeaderboardGraph
      )
      const series = body.data.graph.find((g: any) => g.id === early.user.id)
      return (series?.points ?? []).map((p: any) => p.score)
    }

    try {
      await setFreezeTime(freezeTime)
      expect(await graphScores()).not.toContain(577)

      await setFreezeTime(null)
      expect(await graphScores()).toContain(577)
    } finally {
      for (const id of eventIds) {
        await db.delete(scoreEvents).where(eq(scoreEvents.id, id))
      }
    }
  })

  test('admins can read live standings during the freeze', async () => {
    await setFreezeTime(freezeTime)
    const path = '/api/v2/admin/leaderboard/live?limit=10&offset=0'

    const body = await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(admin.user.id),
      }),
      GoodLeaderboardV2
    )
    expect(body.data.total).toBe(2)
    expect(body.data.leaderboard.map((e: any) => e.id).sort()).toEqual(
      [early.user.id, late.user.id].sort()
    )

    await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(early.user.id),
      }),
      BadPerms
    )
  })
})

describe('scoreboard freeze settings', () => {
  let settingsAdmin: Awaited<ReturnType<typeof generateRealTestUser>>

  beforeAll(async () => {
    settingsAdmin = await generateRealTestUser(Permissions.settingsWrite)
  })

  afterAll(async () => {
    await settingsAdmin.cleanup()
  })

  const putSettings = async (data: Record<string, unknown>) =>
    request(app, '/api/v2/admin/settings', {
      method: 'PUT',
      headers: {
        ...(await authHeaders(settingsAdmin.user.id)),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
    })

  test('accepts a freeze time inside the event', async () => {
    const body = await expectResponse(
      await putSettings({ scoreboardFreezeTime: config.startTime + HOUR }),
      GoodAdminSettingsUpdate
    )
    expect(body.data.overrides.scoreboardFreezeTime).toBe(
      config.startTime + HOUR
    )
  })

  test('accepts a max team size and rejects one below 1', async () => {
    const body = await expectResponse(
      await putSettings({ maxTeamSize: 6 }),
      GoodAdminSettingsUpdate
    )
    expect(body.data.overrides.maxTeamSize).toBe(6)
    expect(body.data.defaults.maxTeamSize).toBe(config.maxTeamSize)

    await expectResponse(await putSettings({ maxTeamSize: 0 }), BadBody)
  })

  test('rejects a freeze time before the start', async () => {
    await expectResponse(
      await putSettings({ scoreboardFreezeTime: config.startTime - 1 }),
      BadBody
    )
  })

  test('rejects a freeze time at or after the end', async () => {
    await expectResponse(
      await putSettings({ scoreboardFreezeTime: config.endTime }),
      BadBody
    )
  })
})
