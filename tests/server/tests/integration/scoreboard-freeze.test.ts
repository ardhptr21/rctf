import { config } from '@rctf/config'
import {
  challenges,
  ChallengeScoringKind,
  createDatabase,
  DynamicScoringTransport,
  scoreEvents,
  settings,
  solves,
  type ChallengeData,
} from '@rctf/db'
import {
  BadBody,
  BadPerms,
  GoodAdminSettingsUpdate,
  GoodChallengeScoresV2,
  GoodChallengeSolvesV2,
  GoodLeaderboardGraph,
  GoodLeaderboardChallengesV2,
  GoodLeaderboardV2,
  GoodLeaderboardWithGraph,
  GoodUserDataV2,
  GoodUserSelfDataV2,
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
  getConfigDefaults,
  getResolvedSettings,
  getScoreboardFreezeCutoff,
  invalidateResolvedSettingsCache,
  RESOLVED_SETTINGS_CACHE_KEY,
  SETTINGS_GENERATION_KEY,
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

  test('a team sees its pre-freeze score and place on /users/me', async () => {
    const me = async (userId: string) =>
      (
        await expectResponse(
          await request(app, '/api/v2/users/me', {
            method: 'GET',
            headers: await authHeaders(userId),
          }),
          GoodUserSelfDataV2
        )
      ).data

    await setFreezeTime(freezeTime)
    await cacheCurrentLeaderboard()

    const earlyMe = await me(early.user.id)
    expect(earlyMe.score).toBeGreaterThan(0)
    expect(earlyMe.globalPlace).toBe(1)

    // the late solve is after the freeze: the team still sees its own
    // solve, but not the score or place it earned
    // the challenge list marks solves from this list, so post-freeze solves
    // must stay in it
    const lateMe = await me(late.user.id)
    expect(lateMe.solves.map((s: any) => s.id)).toEqual([
      challenge.challenge.id,
    ])
    expect(lateMe.score).toBe(0)
    expect(lateMe.globalPlace).toBeNull()
    expect(lateMe.divisionPlace).toBeNull()

    await setFreezeTime(null)
    await cacheCurrentLeaderboard()
    const revealed = await me(late.user.id)
    expect(revealed.score).toBeGreaterThan(0)
    expect(revealed.globalPlace).not.toBeNull()
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

describe('scoreboard freeze with dynamic scoring', () => {
  let rising: Awaited<ReturnType<typeof generateRealTestUser>>
  let steady: Awaited<ReturnType<typeof generateRealTestUser>>
  let admin: Awaited<ReturnType<typeof generateRealTestUser>>
  const challengeId = crypto.randomUUID()
  const now = Date.now()
  const freezeTime = now - HOUR
  const iso = (time: number) => new Date(time).toISOString()

  // `rising` had 100 at the freeze and the feed has since moved it to 300;
  // `steady` had 150 at the freeze and still has it
  beforeAll(async () => {
    const db = getDb()
    rising = await generateRealTestUser()
    steady = await generateRealTestUser()
    admin = await generateRealTestUser(
      Permissions.challsRead | Permissions.leaderboardRead
    )
    const data: ChallengeData = {
      name: crypto.randomUUID(),
      description: '',
      category: 'dynamic',
      author: 'test',
      files: [],
      flags: [],
      tiebreakEligible: true,
      points: { min: 0, max: 0 },
      scoring: {
        kind: ChallengeScoringKind.DYNAMIC,
        source: {
          transport: DynamicScoringTransport.WEBHOOK,
          secret: 'freeze-secret',
        },
      },
    }
    await db.insert(challenges).values({ id: challengeId, data })
    await db.insert(solves).values([
      {
        id: crypto.randomUUID(),
        challengeid: challengeId,
        userid: rising.user.id,
        createdat: iso(now - 2 * HOUR),
        source: 'feed',
        points: 300,
        pointsUpdatedAt: iso(now - HOUR / 2),
      },
      {
        id: crypto.randomUUID(),
        challengeid: challengeId,
        userid: steady.user.id,
        createdat: iso(now - 1.5 * HOUR),
        source: 'feed',
        points: 150,
        pointsUpdatedAt: iso(now - 1.5 * HOUR),
      },
    ])
    const feedEvent = (userid: string, pointsDelta: number, at: number) => ({
      id: crypto.randomUUID(),
      challengeid: challengeId,
      userid,
      pointsDelta,
      eventAt: iso(at),
      source: 'feed' as const,
    })
    await db
      .insert(scoreEvents)
      .values([
        feedEvent(rising.user.id, 100, now - 2 * HOUR),
        feedEvent(steady.user.id, 150, now - 1.5 * HOUR),
        feedEvent(rising.user.id, 200, now - HOUR / 2),
      ])
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(scoreEvents).where(eq(scoreEvents.challengeid, challengeId))
    await db.delete(solves).where(eq(solves.challengeid, challengeId))
    await db.delete(challenges).where(eq(challenges.id, challengeId))
    await rising.cleanup()
    await steady.cleanup()
    await admin.cleanup()
  })

  const scoreOf = (
    result: Awaited<ReturnType<typeof calculateLeaderboard>>,
    userId: string
  ) => result.users.find(user => user.id === userId)?.score

  test('a frozen rebuild counts feed points from the cutoff', async () => {
    await setFreezeTime(freezeTime)
    const frozen = await calculateLeaderboard(getDb())
    expect(scoreOf(frozen, rising.user.id)).toBe(100)
    expect(scoreOf(frozen, steady.user.id)).toBe(150)

    const live = await calculateLeaderboard(getDb(), undefined, {
      ignoreFreeze: true,
    })
    expect(scoreOf(live, rising.user.id)).toBe(300)
  })

  test('challenge scores show the standings at the freeze', async () => {
    await setFreezeTime(freezeTime)
    const path = `/api/v2/challs/${challengeId}/scores?limit=10&offset=0`

    const frozen = await expectResponse(
      await request(app, path, { method: 'GET' }),
      GoodChallengeScoresV2
    )
    expect(
      frozen.data.scores.map((s: any) => [s.userId, s.points, s.pointDelta])
    ).toEqual([
      [steady.user.id, 150, 150],
      [rising.user.id, 100, 0],
    ])
    const risingGraph = frozen.data.graph.find(
      (g: any) => g.id === rising.user.id
    )
    expect(risingGraph.points.map((p: any) => p.score)).not.toContain(300)

    const asAdmin = await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: await authHeaders(admin.user.id),
      }),
      GoodChallengeScoresV2
    )
    expect(asAdmin.data.scores.map((s: any) => [s.userId, s.points])).toEqual([
      [rising.user.id, 300],
      [steady.user.id, 150],
    ])
  })

  test('dynamic score breakdowns stop at the freeze', async () => {
    await setFreezeTime(freezeTime)
    await cacheCurrentLeaderboard()
    const dynamicPoints = (entry: any) =>
      entry.dynamicScores.find((s: any) => s.id === challengeId)?.points

    const board = await expectResponse(
      await request(app, '/api/v2/leaderboard/now?limit=100&offset=0', {
        method: 'GET',
      }),
      GoodLeaderboardV2
    )
    const entry = board.data.leaderboard.find(
      (e: any) => e.id === rising.user.id
    )
    expect(entry.score).toBe(100)
    expect(dynamicPoints(entry)).toBe(100)

    const profile = await expectResponse(
      await request(app, `/api/v2/users/${rising.user.id}`, { method: 'GET' }),
      GoodUserDataV2
    )
    expect(dynamicPoints(profile.data)).toBe(100)
  })

  test('the scoreboard graph stops dynamic points at the freeze', async () => {
    const graphScores = async () => {
      await cacheCurrentLeaderboard()
      const body = await expectResponse(
        await request(
          app,
          '/api/v2/leaderboard/with-graph?limit=100&offset=0',
          { method: 'GET' }
        ),
        GoodLeaderboardWithGraph
      )
      const entry = body.data.graph.find((g: any) => g.id === rising.user.id)
      return (entry?.dynamicPoints ?? []).map((p: any) => p.score)
    }

    // the live graph is cached first, so the frozen read below proves the
    // cache entries for the two states are kept apart
    await setFreezeTime(null)
    expect(await graphScores()).toContain(300)

    await setFreezeTime(freezeTime)
    const frozen = await graphScores()
    expect(frozen).toContain(100)
    expect(frozen).not.toContain(300)
  })
})

describe('settings cache', () => {
  const cacheEntry = (generation: string | null, freezeTime: number | null) =>
    JSON.stringify({
      version: 1,
      defaultsSignature: JSON.stringify(getConfigDefaults()),
      generation,
      resolved: { ...getConfigDefaults(), scoreboardFreezeTime: freezeTime },
    })

  test('a stale write from a slow reader is not served after an update', async () => {
    const db = getDb()
    const redis = await createRedis()
    // a reader notes the generation, then loads the old settings...
    const readerGeneration = (await redis.get(SETTINGS_GENERATION_KEY)) ?? '0'

    // ...while an admin sets a freeze...
    const freezeAt = Date.now() - HOUR
    await updateSettings(db, { scoreboardFreezeTime: freezeAt }, redis)

    // ...and the reader then caches what it loaded: no freeze
    await redis.set(
      RESOLVED_SETTINGS_CACHE_KEY,
      cacheEntry(readerGeneration, null)
    )

    const resolved = await getResolvedSettings(db, redis)
    expect(resolved.scoreboardFreezeTime).toBe(freezeAt)
  })

  test('an entry from the current generation is served from the cache', async () => {
    const db = getDb()
    const redis = await createRedis()
    await updateSettings(db, { scoreboardFreezeTime: null }, redis)
    const generation = await redis.get(SETTINGS_GENERATION_KEY)

    // a value only the cache has proves the read did not hit the database
    await redis.set(RESOLVED_SETTINGS_CACHE_KEY, cacheEntry(generation, 12_345))
    expect((await getResolvedSettings(db, redis)).scoreboardFreezeTime).toBe(
      12_345
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
