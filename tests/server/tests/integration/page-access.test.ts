import { config } from '@rctf/config'
import { createDatabase, settings } from '@rctf/db'
import {
  BadPerms,
  BadToken,
  GoodChallengesV2,
  GoodClientConfigV2,
  GoodLeaderboardV2,
  PageAccess,
  Permissions,
  type ResponseDefinition,
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
import {
  invalidateResolvedSettingsCache,
  updateSettings,
} from '../../../../apps/api/src/services/settings'
import { createRedis } from '../../../../apps/api/src/util/redis'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateAuthToken,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db

let app: Hono<any>
let player: Awaited<ReturnType<typeof generateRealTestUser>>
let admin: Awaited<ReturnType<typeof generateRealTestUser>>

const setPageAccess = async (pageAccess: {
  challenges?: PageAccess
  scores?: PageAccess
}) => {
  const redis = await createRedis()
  await updateSettings(getDb(), { pageAccess }, redis)
}

const resetSettings = async () => {
  const redis = await createRedis()
  await getDb().delete(settings).where(eq(settings.id, 'value-0'))
  await invalidateResolvedSettingsCache(redis)
}

beforeAll(async () => {
  app = await getApp()
  player = await generateRealTestUser()
  admin = await generateRealTestUser(Permissions.challsRead)
})

afterEach(async () => {
  await resetSettings()
})

afterAll(async () => {
  await resetSettings()
  await player.cleanup()
  await admin.cleanup()
})

type Viewer = 'anonymous' | 'player' | 'admin'

const fetchAs = async (path: string, viewer: Viewer) => {
  const userId =
    viewer === 'player'
      ? player.user.id
      : viewer === 'admin'
        ? admin.user.id
        : null
  return request(app, path, {
    method: 'GET',
    headers: userId
      ? { Authorization: `Bearer ${await generateAuthToken(userId)}` }
      : {},
  })
}

const pages = [
  {
    page: 'challenges' as const,
    path: '/api/v2/challs',
    good: GoodChallengesV2,
  },
  {
    page: 'scores' as const,
    path: '/api/v2/leaderboard/now?limit=10&offset=0',
    good: GoodLeaderboardV2,
  },
]

const expectations: Record<
  PageAccess,
  Record<Viewer, 'good' | ResponseDefinition<string, any>>
> = {
  [PageAccess.Public]: { anonymous: 'good', player: 'good', admin: 'good' },
  [PageAccess.Private]: { anonymous: BadToken, player: 'good', admin: 'good' },
  [PageAccess.Admin]: { anonymous: BadToken, player: BadPerms, admin: 'good' },
}

describe('page access', () => {
  for (const { page, path, good } of pages) {
    for (const access of Object.values(PageAccess)) {
      for (const viewer of ['anonymous', 'player', 'admin'] as const) {
        const expected = expectations[access][viewer]
        test(`${page} as ${access}: ${viewer} gets ${
          expected === 'good' ? 'access' : expected.kind
        }`, async () => {
          await setPageAccess({ [page]: access })
          await expectResponse(
            await fetchAs(path, viewer),
            expected === 'good' ? good : expected
          )
        })
      }
    }
  }

  test('a restricted page does not affect the other page', async () => {
    await setPageAccess({ challenges: PageAccess.Admin })
    await expectResponse(
      await fetchAs('/api/v2/leaderboard/now?limit=10&offset=0', 'anonymous'),
      GoodLeaderboardV2
    )
  })

  test('the client config exposes page access', async () => {
    await setPageAccess({
      challenges: PageAccess.Private,
      scores: PageAccess.Admin,
    })
    const body = await expectResponse(
      await fetchAs('/api/v2/integrations/client/config', 'anonymous'),
      GoodClientConfigV2
    )
    expect(body.data.pageAccess).toEqual({
      challenges: PageAccess.Private,
      scores: PageAccess.Admin,
    })
  })
})
