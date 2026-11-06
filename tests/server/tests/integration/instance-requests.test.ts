import { config } from '@rctf/config'
import { createDatabase, instanceHistory } from '@rctf/db'
import {
  BadEndpoint,
  BadPerms,
  BadToken,
  ExposeKind,
  GoodAdminInstance,
  GoodAdminInstanceRequests,
  GoodAdminInstances,
  GoodInstanceRequestsIngest,
  InstanceStatus,
  Permissions,
} from '@rctf/types'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import {
  recordInstanceStart,
  recordInstanceStop,
} from '../../../../apps/api/src/services/instance-history'
import { ingestInstanceRequests } from '../../../../apps/api/src/services/instance-requests'
import { getApp, request } from '../../app'
import {
  clearDatabase,
  expectResponse,
  generateAuthToken,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db
const TOKEN = 'request-logs-token-123'
const HOUR = 60 * 60 * 1000
const originalSetting = config.instanceRequestLogs

let app: Hono<any>

beforeAll(async () => {
  app = await getApp()
  config.instanceRequestLogs = { token: TOKEN, maxRequestsPerInstance: 2000 }
})

afterAll(() => {
  config.instanceRequestLogs = originalSetting
})

beforeEach(async () => {
  await clearDatabase()
})

const context = {
  playerId: null,
  ip: '198.51.100.7',
  log: { error: () => {} } as any,
}

// an instance reachable at `host`, started now
const startInstance = async (host: string) => {
  const team = await generateRealTestUser()
  const { challenge } = await generateChallenge()
  await recordInstanceStart(
    getDb(),
    context,
    { teamId: team.user.id, challengeId: challenge.id },
    {
      kind: 'instancerInstanceDetails',
      status: InstanceStatus.RUNNING,
      timeLeftMilliseconds: HOUR,
      endpoints: [{ kind: ExposeKind.HTTPS, host, port: 443 }],
    }
  )
  const [entry] = await getDb()
    .select()
    .from(instanceHistory)
    .where(eq(instanceHistory.teamId, team.user.id))
  return { id: entry!.id, teamId: team.user.id, challengeId: challenge.id }
}

// a Traefik JSON access log line
const accessLog = (
  host: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  StartUTC: new Date().toISOString(),
  ClientHost: '203.0.113.42',
  RequestHost: host,
  RequestMethod: 'GET',
  RequestPath: '/notes?id=1',
  DownstreamStatus: 200,
  DownstreamContentSize: 512,
  Duration: 12_500_000,
  RouterName: 'ti-1-web-0@docker',
  'request_User-Agent': 'curl/8.5.0',
  ...overrides,
})

const ingest = (entries: unknown[], token: string | null = TOKEN) =>
  request(app, '/api/v2/integrations/instance-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ entries }),
  })

const adminToken = async () =>
  generateAuthToken(
    (
      await generateRealTestUser(
        Permissions.usersWrite | Permissions.challsRead
      )
    ).user.id
  )

const adminGet = (path: string, token: string) =>
  request(app, path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

describe('instance request ingest', () => {
  test('refuses a missing or wrong token', async () => {
    await expectResponse(await ingest([], null), BadToken)
    await expectResponse(await ingest([], 'not-the-token-123'), BadToken)
  })

  test('is unavailable without a configured token', async () => {
    config.instanceRequestLogs = undefined
    try {
      await expectResponse(await ingest([]), BadEndpoint)
    } finally {
      config.instanceRequestLogs = {
        token: TOKEN,
        maxRequestsPerInstance: 2000,
      }
    }
  })

  test('stores requests on the instance they reached', async () => {
    const instance = await startInstance('web-1.inst.example.com')

    const body = await expectResponse(
      await ingest([
        accessLog('web-1.inst.example.com'),
        // the port and case don't matter
        accessLog('WEB-1.inst.example.com:443', { RequestPath: '/login' }),
        accessLog('unknown.inst.example.com'),
        // answered by Traefik itself: no router matched, so it never
        // reached the instance
        accessLog('web-1.inst.example.com', {
          RouterName: undefined,
          DownstreamStatus: 404,
        }),
        { level: 'info', msg: 'Configuration loaded' },
      ]),
      GoodInstanceRequestsIngest
    )

    expect(body.data).toEqual({ stored: 2, unmatched: 2, invalid: 1 })
    const [entry] = await getDb()
      .select()
      .from(instanceHistory)
      .where(eq(instanceHistory.id, instance.id))
    expect(entry!.requestCount).toBe(2)
    expect(entry!.lastRequestAt).not.toBeNull()
  })

  test('a restarted instance on the same host gets only its own requests', async () => {
    const first = await startInstance('web-2.inst.example.com')
    // the first instance ran two hours ago, then a new one took its host
    await getDb()
      .update(instanceHistory)
      .set({
        startedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
        endedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      })
      .where(eq(instanceHistory.id, first.id))
    const second = await startInstance('web-2.inst.example.com')

    await ingest([
      accessLog('web-2.inst.example.com', {
        StartUTC: new Date(Date.now() - 2.5 * HOUR).toISOString(),
      }),
      accessLog('web-2.inst.example.com'),
      accessLog('web-2.inst.example.com'),
      // between the two, when nothing was running
      accessLog('web-2.inst.example.com', {
        StartUTC: new Date(Date.now() - 1.5 * HOUR).toISOString(),
      }),
    ])

    const counts = await getDb()
      .select({ id: instanceHistory.id, count: instanceHistory.requestCount })
      .from(instanceHistory)
    expect(Object.fromEntries(counts.map(row => [row.id, row.count]))).toEqual({
      [first.id]: 1,
      [second.id]: 2,
    })
  })

  test('keeps the newest requests but counts every one', async () => {
    const instance = await startInstance('web-3.inst.example.com')
    const now = Date.now()
    const entries = Array.from({ length: 5 }, (_, i) =>
      accessLog('web-3.inst.example.com', {
        StartUTC: new Date(now - (5 - i) * 1000).toISOString(),
        RequestPath: `/page/${i}`,
      })
    )

    await ingestInstanceRequests(getDb(), entries, 3)
    await ingestInstanceRequests(
      getDb(),
      [
        accessLog('web-3.inst.example.com', {
          StartUTC: new Date(now).toISOString(),
          RequestPath: '/page/5',
        }),
      ],
      3
    )

    const token = await adminToken()
    const detail = await expectResponse(
      await adminGet(`/api/v2/admin/instances/${instance.id}`, token),
      GoodAdminInstance
    )
    expect(detail.data.requests).toMatchObject({ total: 6, kept: 3 })
    const page = await expectResponse(
      await adminGet(
        `/api/v2/admin/instances/${instance.id}/requests?limit=10&offset=0`,
        token
      ),
      GoodAdminInstanceRequests
    )
    expect(page.data.requests.map((row: any) => row.path)).toEqual([
      '/page/5',
      '/page/4',
      '/page/3',
    ])
  })
})

describe('admin instance detail', () => {
  test('summarises and filters the requests', async () => {
    const instance = await startInstance('web-4.inst.example.com')
    await ingest([
      accessLog('web-4.inst.example.com', { DownstreamStatus: 200 }),
      accessLog('web-4.inst.example.com', {
        DownstreamStatus: 404,
        RequestPath: '/admin',
      }),
      accessLog('web-4.inst.example.com', {
        DownstreamStatus: 500,
        ClientHost: '192.0.2.10',
      }),
    ])
    const token = await adminToken()

    const detail = await expectResponse(
      await adminGet(`/api/v2/admin/instances/${instance.id}`, token),
      GoodAdminInstance
    )
    expect(detail.data.instance.requestCount).toBe(3)
    expect(detail.data.requests).toMatchObject({
      total: 3,
      kept: 3,
      uniqueIps: 2,
      statusClasses: { '2xx': 1, '3xx': 0, '4xx': 1, '5xx': 1 },
    })

    const list = async (query: string) =>
      (
        await expectResponse(
          await adminGet(
            `/api/v2/admin/instances/${instance.id}/requests?limit=50&offset=0${query}`,
            token
          ),
          GoodAdminInstanceRequests
        )
      ).data

    expect((await list('&statusClass=4')).requests).toMatchObject([
      { status: 404, path: '/admin', method: 'GET', durationMs: 13 },
    ])
    expect((await list('&clientIp=192.0.2.10')).total).toBe(1)
    expect((await list('&path=ADMIN')).total).toBe(1)

    // the list shows the count too
    const listed = await expectResponse(
      await request(app, '/api/v2/admin/instances?limit=10&offset=0', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: '{}',
      }),
      GoodAdminInstances
    )
    expect(listed.data.instances[0].requestCount).toBe(3)
  })

  test('requests after a stop still reach the stopped instance briefly', async () => {
    const instance = await startInstance('web-5.inst.example.com')
    await recordInstanceStop(
      getDb(),
      context,
      { teamId: instance.teamId, challengeId: instance.challengeId },
      {
        kind: 'instancerInstanceDetails',
        status: InstanceStatus.STOPPED,
        timeLeftMilliseconds: null,
        endpoints: null,
      }
    )

    const body = await expectResponse(
      await ingest([accessLog('web-5.inst.example.com')]),
      GoodInstanceRequestsIngest
    )
    expect(body.data.stored).toBe(1)
  })

  test('requires admin permissions', async () => {
    const instance = await startInstance('web-6.inst.example.com')
    const token = await generateAuthToken(
      (await generateRealTestUser(Permissions.challsRead)).user.id
    )
    await expectResponse(
      await adminGet(`/api/v2/admin/instances/${instance.id}`, token),
      BadPerms
    )
  })
})
