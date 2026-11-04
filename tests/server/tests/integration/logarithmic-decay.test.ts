import { config } from '@rctf/config'
import { challenges, createDatabase, solves } from '@rctf/db'
import {
  BadBody,
  ChallengeScoringKind,
  GoodChallengeUpdateV2,
  Permissions,
} from '@rctf/types'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import {
  calculateLeaderboard,
  createCachedLeaderboardCalculator,
} from '../../../../apps/api/src/services/leaderboard-calculation'
import { applyDecayPointsForChallenge } from '../../../../apps/api/src/services/solve-points'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateAuthToken,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db
const HOUR = 60 * 60 * 1000

let app: Hono<any>
let adminToken: string
const cleanups: Array<() => Promise<void>> = []

beforeAll(async () => {
  app = await getApp()
  const admin = await generateRealTestUser(
    Permissions.challsRead | Permissions.challsWrite
  )
  cleanups.push(admin.cleanup)
  adminToken = await generateAuthToken(admin.user.id)
})

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
})

const updateChallenge = (id: string, data: Record<string, unknown>) =>
  request(app, `/api/v2/admin/challs/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ data }),
  })

// a 100-500 point challenge
const decayChallenge = async () => {
  const generated = await generateChallenge()
  cleanups.push(generated.cleanup)
  await expectResponse(
    await updateChallenge(generated.challenge.id, {
      points: { min: 100, max: 500 },
    }),
    GoodChallengeUpdateV2
  )
  return generated.challenge.id
}

const solve = async (challengeId: string, at: number) => {
  const team = await generateRealTestUser()
  cleanups.push(team.cleanup)
  await getDb()
    .insert(solves)
    .values({
      id: crypto.randomUUID(),
      challengeid: challengeId,
      userid: team.user.id,
      createdat: new Date(at).toISOString(),
    })
  return team.user.id
}

const storedPoints = async (challengeId: string) =>
  (
    await getDb()
      .select({ points: solves.points })
      .from(solves)
      .where(eq(solves.challengeid, challengeId))
  ).map(row => row.points)

const scoreboardValue = async (challengeId: string) =>
  (await calculateLeaderboard(getDb())).challengeInfos.get(challengeId)?.score

describe('logarithmic decay', () => {
  test('a challenge follows its own curve, solve by solve', async () => {
    const id = await decayChallenge()
    await expectResponse(
      await updateChallenge(id, {
        scoring: { kind: ChallengeScoringKind.DECAY, decay: 3 },
      }),
      GoodChallengeUpdateV2
    )

    // ((100 - 500) / 3²) × n² + 500, with n the solves after the first
    const expected = [500, 456, 322, 100, 100]
    const start = Date.now() - 10 * HOUR
    for (const [index, value] of expected.entries()) {
      await solve(id, start + index * HOUR)
      const { newPoints } = await applyDecayPointsForChallenge(getDb(), id)
      expect(newPoints).toBe(value)
      // every solver holds the current value
      expect(new Set(await storedPoints(id))).toEqual(new Set([value]))
      expect(await scoreboardValue(id)).toBe(value)
    }
  })

  test('changing the decay recalculates existing solves', async () => {
    const id = await decayChallenge()
    await solve(id, Date.now() - 2 * HOUR)
    await solve(id, Date.now() - HOUR)
    await applyDecayPointsForChallenge(getDb(), id)
    const before = await storedPoints(id)

    await expectResponse(
      await updateChallenge(id, {
        scoring: { kind: ChallengeScoringKind.DECAY, decay: 1 },
      }),
      GoodChallengeUpdateV2
    )

    // with decay 1 the second solve already reaches the minimum
    expect(new Set(await storedPoints(id))).toEqual(new Set([100]))
    expect(before).not.toEqual(await storedPoints(id))
    expect(await scoreboardValue(id)).toBe(100)

    // going back to the CTF-wide formula recalculates again
    await expectResponse(
      await updateChallenge(id, {
        scoring: { kind: ChallengeScoringKind.DECAY },
      }),
      GoodChallengeUpdateV2
    )
    expect(await storedPoints(id)).toEqual(before)
  })

  test("the worker's cached scoreboard picks up a decay change", async () => {
    const id = await decayChallenge()
    for (let i = 0; i < 4; i++) await solve(id, Date.now() - (5 - i) * HOUR)
    // the leaderboard worker keeps its state between ticks
    const calc = createCachedLeaderboardCalculator()
    const before = (await calc(getDb())).calculated.challengeInfos.get(
      id
    )?.score

    await expectResponse(
      await updateChallenge(id, {
        scoring: { kind: ChallengeScoringKind.DECAY, decay: 3 },
      }),
      GoodChallengeUpdateV2
    )
    const after = await calc(getDb())

    expect(before).not.toBe(100)
    expect(after.recomputedFromScratch).toBe(true)
    expect(after.calculated.challengeInfos.get(id)?.score).toBe(100)
  })

  test('the decay setting is stored with the challenge', async () => {
    const id = await decayChallenge()
    await updateChallenge(id, {
      scoring: { kind: ChallengeScoringKind.DECAY, decay: 25 },
    })
    const [row] = await getDb()
      .select({ data: challenges.data })
      .from(challenges)
      .where(eq(challenges.id, id))
    expect(row!.data.scoring).toEqual({
      kind: ChallengeScoringKind.DECAY,
      decay: 25,
    })
  })

  test('rejects a decay that is not a whole number of solves', async () => {
    const id = await decayChallenge()
    for (const decay of [0, -3, 2.5]) {
      await expectResponse(
        await updateChallenge(id, {
          scoring: { kind: ChallengeScoringKind.DECAY, decay },
        }),
        BadBody
      )
    }
  })
})
