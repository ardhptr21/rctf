import { config } from '@rctf/config'
import { challenges, createDatabase, instanceHistory } from '@rctf/db'
import {
  BadPerms,
  ExposeKind,
  GoodAdminInstances,
  GoodFlag,
  GoodInstanceStatus,
  InstanceStatus,
  Permissions,
} from '@rctf/types'
import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import {
  InstancerProvider,
  type instanceDetailsOrError,
} from '../../../../apps/api/src/providers/instancer/base'
import * as instancerInstances from '../../../../apps/api/src/providers/instances/instancer'
import {
  recordInstanceStart,
  recordInstanceStatus,
  type InstanceHistoryContext,
} from '../../../../apps/api/src/services/instance-history'
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

// An instancer that keeps one instance per team and challenge in memory.
// Each start hands out a new hostname, as real instancers do.
class StubInstancer extends InstancerProvider {
  readonly configSchema = { parse: (value: unknown) => value } as any
  readonly capabilities = { canStop: true, canExtend: true }
  getDefaults = () => ({})
  running = new Map<string, { host: string; timeLeft: number | null }>()
  timeLeft: number | null = HOUR
  status: InstanceStatus | null = null
  starts = 0

  private details(key: string): instanceDetailsOrError {
    const instance = this.running.get(key)
    if (!instance) {
      return {
        kind: 'instancerInstanceDetails',
        status: InstanceStatus.STOPPED,
        timeLeftMilliseconds: null,
        endpoints: null,
      }
    }
    return {
      kind: 'instancerInstanceDetails',
      status: this.status ?? InstanceStatus.RUNNING,
      timeLeftMilliseconds: instance.timeLeft,
      endpoints: [{ kind: ExposeKind.HTTPS, host: instance.host, port: 443 }],
    }
  }

  createInstance = async (options: any) => {
    const key = `${options.user.id}/${options.challengeIntegrationId}`
    if (!this.running.has(key)) {
      this.running.set(key, {
        host: `web-${++this.starts}.inst.example.com`,
        timeLeft: this.timeLeft,
      })
    }
    return this.details(key)
  }
  getInstance = async (options: any) =>
    this.details(`${options.teamId}/${options.challengeIntegrationId}`)
  deleteInstance = async (options: any) => {
    const key = `${options.teamId}/${options.challengeIntegrationId}`
    this.running.delete(key)
    return this.details(key)
  }
  extendInstance = async (options: any) => {
    const key = `${options.teamId}/${options.challengeIntegrationId}`
    const instance = this.running.get(key)
    if (instance) instance.timeLeft = 2 * HOUR
    return this.details(key)
  }
}

const stub = new StubInstancer({})

mock.module('../../../../apps/api/src/providers/instances/instancer', () => ({
  ...instancerInstances,
  instancers: { stub },
  defaultInstancerName: 'stub',
  instancerEnabled: true,
}))

let app: Hono<any>

beforeAll(async () => {
  app = await getApp()
})

beforeEach(async () => {
  await clearDatabase()
  stub.running.clear()
  stub.timeLeft = HOUR
  stub.status = null
})

// a challenge that uses the stub instancer
const instancedChallenge = async (category = 'web', name = 'Notes') => {
  const { challenge } = await generateChallenge()
  const { id, flag: _flag, ...data } = challenge
  await getDb()
    .update(challenges)
    .set({
      data: {
        ...data,
        category,
        name,
        instancerConfig: {
          challengeIntegrationId: id,
          instancer: 'stub',
          config: {},
          timeoutMilliseconds: HOUR,
          extendable: true,
        },
      },
    })
    .where(eq(challenges.id, id))
  return id
}

const instanceCall = async (
  method: 'GET' | 'PUT' | 'DELETE' | 'PATCH',
  token: string,
  challengeId: string
) =>
  request(app, `/api/v2/integrations/challs/${challengeId}/instance`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: '{}' }),
  })

const listInstances = async (
  token: string,
  body: Record<string, unknown> = {},
  query = ''
) =>
  request(app, `/api/v2/admin/instances?limit=100&offset=0${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

const adminToken = async () =>
  generateAuthToken(
    (
      await generateRealTestUser(
        Permissions.usersWrite | Permissions.challsRead
      )
    ).user.id
  )

const entries = () =>
  getDb().select().from(instanceHistory).orderBy(instanceHistory.startedAt)

describe('instance history', () => {
  test('a start, stop and restart make two entries', async () => {
    const team = await generateRealTestUser()
    const token = await generateAuthToken(team.user.id)
    const challengeId = await instancedChallenge()

    await expectResponse(
      await instanceCall('PUT', token, challengeId),
      GoodInstanceStatus
    )
    // starting again while it runs returns the same instance
    await expectResponse(
      await instanceCall('PUT', token, challengeId),
      GoodInstanceStatus
    )
    let rows = await entries()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      teamId: team.user.id,
      challengeId,
      playerId: null,
      endedAt: null,
      endpoints: [
        { kind: ExposeKind.HTTPS, host: 'web-1.inst.example.com', port: 443 },
      ],
    })
    expect(
      Date.parse(rows[0]!.expiresAt!) - Date.parse(rows[0]!.startedAt)
    ).toBeWithin(HOUR - 5000, HOUR + 5000)

    await expectResponse(
      await instanceCall('PATCH', token, challengeId),
      GoodInstanceStatus
    )
    rows = await entries()
    expect(rows[0]!.extendCount).toBe(1)

    await expectResponse(
      await instanceCall('DELETE', token, challengeId),
      GoodInstanceStatus
    )
    await expectResponse(
      await instanceCall('PUT', token, challengeId),
      GoodInstanceStatus
    )

    rows = await entries()
    expect(rows.map(row => [row.endReason, row.endedAt === null])).toEqual([
      ['stopped', false],
      [null, true],
    ])
    expect(rows[1]!.endpoints[0]!.host).toBe('web-2.inst.example.com')
  })

  test('a status check closes an instance that went away', async () => {
    const team = await generateRealTestUser()
    const token = await generateAuthToken(team.user.id)
    const challengeId = await instancedChallenge()
    await instanceCall('PUT', token, challengeId)

    // the instancer lost it, for example it crashed
    stub.running.clear()
    await instanceCall('GET', token, challengeId)

    const [row] = await entries()
    expect(row!.endReason).toBe('gone')
    expect(row!.endedAt).not.toBeNull()
  })

  test('an errored instance is closed as errored', async () => {
    const team = await generateRealTestUser()
    const token = await generateAuthToken(team.user.id)
    const challengeId = await instancedChallenge()
    await instanceCall('PUT', token, challengeId)

    stub.status = InstanceStatus.ERRORED
    await instanceCall('GET', token, challengeId)

    const [row] = await entries()
    expect(row!.endReason).toBe('errored')
  })

  // the instance is stopped in the background of the solve
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 50 && !(await check()); i++) {
      await Bun.sleep(20)
    }
  }

  const solve = async (token: string, challengeId: string) => {
    const [row] = await getDb()
      .select({ data: challenges.data })
      .from(challenges)
      .where(eq(challenges.id, challengeId))
    const flag = (row!.data.flags[0]!.config as { flag: string }).flag
    return request(app, `/api/v1/challs/${challengeId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ flag }),
    })
  }

  test("solving stops the team's instance", async () => {
    const team = await generateRealTestUser()
    const token = await generateAuthToken(team.user.id)
    const challengeId = await instancedChallenge()
    await instanceCall('PUT', token, challengeId)

    await expectResponse(await solve(token, challengeId), GoodFlag)
    await waitFor(async () => (await entries())[0]?.endedAt !== null)

    expect(stub.running.size).toBe(0)
    const [row] = await entries()
    expect(row!.endReason).toBe('solved')
  })

  test('admin teams keep their instance after solving', async () => {
    const admin = await generateRealTestUser(Permissions.challsRead)
    const token = await generateAuthToken(admin.user.id)
    const challengeId = await instancedChallenge()
    await instanceCall('PUT', token, challengeId)

    await expectResponse(await solve(token, challengeId), GoodFlag)
    await Bun.sleep(200)

    expect(stub.running.size).toBe(1)
  })

  test('admin teams are not recorded', async () => {
    const admin = await generateRealTestUser(Permissions.challsRead)
    const challengeId = await instancedChallenge()

    await instanceCall(
      'PUT',
      await generateAuthToken(admin.user.id),
      challengeId
    )

    expect(await entries()).toEqual([])
  })

  test('a recording failure does not fail the instance call', async () => {
    const error = mock(() => {})
    const context: InstanceHistoryContext = {
      playerId: null,
      ip: '127.0.0.1',
      log: { error } as any,
    }
    // a team id over the column's limit is fine, but a broken db is not
    const broken = {
      select: () => {
        throw new Error('db down')
      },
    } as any

    await recordInstanceStart(
      broken,
      context,
      { teamId: 't', challengeId: 'c' },
      {
        kind: 'instancerInstanceDetails',
        status: InstanceStatus.RUNNING,
        timeLeftMilliseconds: HOUR,
        endpoints: [],
      }
    )
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('admin instance list', () => {
  // three instances over two teams and two categories; one ran out of time
  const seed = async () => {
    const [alpha, beta] = [
      await generateRealTestUser(),
      await generateRealTestUser(),
    ]
    const web = await instancedChallenge('web', 'Notes')
    const pwn = await instancedChallenge('pwn', 'Heap')
    const context: InstanceHistoryContext = {
      playerId: null,
      ip: '198.51.100.7',
      log: { error: () => {} } as any,
    }
    const running = (timeLeft: number | null): instanceDetailsOrError => ({
      kind: 'instancerInstanceDetails',
      status: InstanceStatus.RUNNING,
      timeLeftMilliseconds: timeLeft,
      endpoints: [{ kind: ExposeKind.HTTPS, host: 'h.example.com', port: 443 }],
    })
    await recordInstanceStart(
      getDb(),
      context,
      { teamId: alpha.user.id, challengeId: web },
      running(HOUR)
    )
    await recordInstanceStart(
      getDb(),
      context,
      { teamId: alpha.user.id, challengeId: pwn },
      running(HOUR)
    )
    await recordInstanceStart(
      getDb(),
      context,
      { teamId: beta.user.id, challengeId: web },
      running(HOUR)
    )
    // alpha's web instance ran out of time without anyone looking
    await getDb()
      .update(instanceHistory)
      .set({
        startedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
        expiresAt: new Date(Date.now() - HOUR).toISOString(),
      })
      .where(
        and(
          eq(instanceHistory.challengeId, web),
          eq(instanceHistory.teamId, alpha.user.id)
        )
      )
    return { alpha: alpha.user, beta: beta.user, web, pwn }
  }

  test('lists every instance with its status and totals', async () => {
    const token = await adminToken()
    const { alpha, web } = await seed()

    const body = await expectResponse(
      await listInstances(token),
      GoodAdminInstances
    )

    expect(body.data.total).toBe(3)
    expect(body.data.teams).toBe(2)
    expect(body.data.categories).toEqual([
      { category: 'web', count: 2 },
      { category: 'pwn', count: 1 },
    ])
    const expired = body.data.instances.find(
      (row: any) => row.team.id === alpha.id && row.challenge.id === web
    )
    expect(expired).toMatchObject({
      status: 'expired',
      challenge: { name: 'Notes', category: 'web' },
      ip: '198.51.100.7',
      player: null,
    })
    expect(expired.endedAt).toBe(expired.expiresAt)
    // newest first
    expect(body.data.instances.at(-1).id).toBe(expired.id)
  })

  test('filters by team, category and status', async () => {
    const token = await adminToken()
    const { alpha } = await seed()

    const byTeam = await expectResponse(
      await listInstances(token, { team: { include: [alpha.id] } }),
      GoodAdminInstances
    )
    expect(byTeam.data.total).toBe(2)

    const pwn = await expectResponse(
      await listInstances(token, { category: { include: ['pwn'] } }),
      GoodAdminInstances
    )
    expect(pwn.data.instances.map((row: any) => row.challenge.name)).toEqual([
      'Heap',
    ])

    const running = await expectResponse(
      await listInstances(token, { status: { include: ['running'] } }),
      GoodAdminInstances
    )
    expect(running.data.total).toBe(2)
  })

  test('a later status check writes the expiry back', async () => {
    const { alpha, web } = await seed()

    await recordInstanceStatus(
      getDb(),
      { playerId: null, ip: '', log: { error: () => {} } as any },
      { teamId: alpha.id, challengeId: web },
      {
        kind: 'instancerInstanceDetails',
        status: InstanceStatus.STOPPED,
        timeLeftMilliseconds: null,
        endpoints: null,
      }
    )

    const [row] = await getDb()
      .select()
      .from(instanceHistory)
      .where(
        and(
          eq(instanceHistory.challengeId, web),
          eq(instanceHistory.teamId, alpha.id)
        )
      )
    expect(row!.endReason).toBe('expired')
    expect(Date.parse(row!.endedAt!)).toBe(Date.parse(row!.expiresAt!))
  })

  test('requires admin permissions', async () => {
    const token = await generateAuthToken(
      (await generateRealTestUser(Permissions.challsRead)).user.id
    )
    await expectResponse(await listInstances(token), BadPerms)
  })
})
