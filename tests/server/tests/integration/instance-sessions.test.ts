import { config } from '@rctf/config'
import { createDatabase, instanceHistory } from '@rctf/db'
import {
  BadPerms,
  BadToken,
  ExposeKind,
  GoodAdminInstance,
  GoodAdminInstances,
  GoodAdminInstanceSessions,
  GoodInstanceSessionsIngest,
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
import { recordInstanceStart } from '../../../../apps/api/src/services/instance-history'
import { ingestInstanceSessions } from '../../../../apps/api/src/services/instance-sessions'
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
const b64 = (text: string) => Buffer.from(text).toString('base64')

let app: Hono<any>

beforeAll(async () => {
  app = await getApp()
  config.instanceRequestLogs = {
    token: TOKEN,
    maxPerInstance: 2000,
    maxSessionsPerInstance: 500,
  }
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

// an instance with a tcp-ssl endpoint at `host`, started now
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
      endpoints: [{ kind: ExposeKind.TCP_SSL, host, port: 1337 }],
    }
  )
  const [entry] = await getDb()
    .select()
    .from(instanceHistory)
    .where(eq(instanceHistory.teamId, team.user.id))
  return { id: entry!.id }
}

let nextKey = 0
// a connection record as the tcplog proxy prints it
const session = (
  host: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  kind: 'tcp-session',
  id: `conn${nextKey++}`,
  host,
  clientIp: '203.0.113.42',
  clientPort: 40000,
  startedAt: new Date().toISOString(),
  durationMs: 1500,
  bytesIn: 5,
  bytesOut: 11,
  truncated: false,
  open: false,
  error: null,
  transcript: [
    { dir: 'out', t: 0, data: b64('hello\n') },
    { dir: 'in', t: 900, data: b64('flag\n') },
  ],
  ...overrides,
})

const ingest = (entries: unknown[], token: string | null = TOKEN) =>
  request(app, '/api/v2/integrations/instance-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ entries }),
  })

const adminToken = async (
  permissions = Permissions.usersWrite | Permissions.challsRead
) => generateAuthToken((await generateRealTestUser(permissions)).user.id)

const adminGet = (path: string, token: string) =>
  request(app, path, { headers: { Authorization: `Bearer ${token}` } })

describe('connection log ingest', () => {
  test('refuses a missing or wrong token', async () => {
    await expectResponse(await ingest([], null), BadToken)
    await expectResponse(await ingest([], 'not-the-token-123'), BadToken)
  })

  test('stores connections on the instance they reached', async () => {
    const instance = await startInstance('pwn-1.inst.example.com')
    const body = await expectResponse(
      await ingest([
        session('pwn-1.inst.example.com'),
        session('PWN-1.inst.example.com', { clientIp: '198.51.100.9' }),
        session('unknown.inst.example.com'),
        { kind: 'tcp-session' },
      ]),
      GoodInstanceSessionsIngest
    )
    expect(body.data).toEqual({ stored: 2, unmatched: 1, invalid: 1 })

    const token = await adminToken()
    const detail = await expectResponse(
      await adminGet(`/api/v2/admin/instances/${instance.id}`, token),
      GoodAdminInstance
    )
    expect(detail.data.instance.sessionCount).toBe(2)
    expect(detail.data.sessions).toMatchObject({
      total: 2,
      kept: 2,
      uniqueIps: 2,
    })
    expect(detail.data.sessions.lastAt).not.toBeNull()

    const page = await expectResponse(
      await adminGet(
        `/api/v2/admin/instances/${instance.id}/sessions?limit=10&offset=0&clientIp=198.51.100.9`,
        token
      ),
      GoodAdminInstanceSessions
    )
    expect(page.data.total).toBe(1)
    expect(page.data.sessions[0]).toMatchObject({
      clientIp: '198.51.100.9',
      host: 'pwn-1.inst.example.com',
      bytesIn: 5,
      bytesOut: 11,
      open: false,
      truncated: false,
      error: null,
      transcript: [
        { dir: 'out', t: 0, data: b64('hello\n') },
        { dir: 'in', t: 900, data: b64('flag\n') },
      ],
    })

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
    expect(listed.data.instances[0]?.sessionCount).toBe(2)
  })

  test('a later report of an open connection replaces it and is counted once', async () => {
    const instance = await startInstance('pwn-2.inst.example.com')
    const first = session('pwn-2.inst.example.com', {
      id: 'long-shell',
      open: true,
      durationMs: 30_000,
      bytesIn: 3,
      transcript: [{ dir: 'in', t: 0, data: b64('id\n') }],
    })
    await expectResponse(await ingest([first]), GoodInstanceSessionsIngest)
    // the interim and final reports can also arrive in one batch
    await expectResponse(
      await ingest([
        { ...first, durationMs: 60_000 },
        { ...first, open: false, durationMs: 75_000, bytesIn: 9 },
      ]),
      GoodInstanceSessionsIngest
    )

    const token = await adminToken()
    const page = await expectResponse(
      await adminGet(
        `/api/v2/admin/instances/${instance.id}/sessions?limit=10&offset=0`,
        token
      ),
      GoodAdminInstanceSessions
    )
    expect(page.data.total).toBe(1)
    expect(page.data.sessions[0]).toMatchObject({
      open: false,
      durationMs: 75_000,
      bytesIn: 9,
    })
    const [row] = await getDb()
      .select({ count: instanceHistory.sessionCount })
      .from(instanceHistory)
      .where(eq(instanceHistory.id, instance.id))
    expect(row?.count).toBe(1)
  })

  test('keeps the newest connections but counts every one', async () => {
    const instance = await startInstance('pwn-3.inst.example.com')
    const base = Date.now()
    await ingestInstanceSessions(
      getDb(),
      [0, 1, 2, 3, 4].map(i =>
        session('pwn-3.inst.example.com', {
          id: `c${i}`,
          startedAt: new Date(base + i * 1000).toISOString(),
        })
      ),
      2
    )

    const token = await adminToken()
    const detail = await expectResponse(
      await adminGet(`/api/v2/admin/instances/${instance.id}`, token),
      GoodAdminInstance
    )
    expect(detail.data.sessions).toMatchObject({ total: 5, kept: 2 })
  })

  test('requires admin permissions', async () => {
    const instance = await startInstance('pwn-4.inst.example.com')
    const token = await adminToken(Permissions.challsRead)
    await expectResponse(
      await adminGet(
        `/api/v2/admin/instances/${instance.id}/sessions?limit=10&offset=0`,
        token
      ),
      BadPerms
    )
  })
})
