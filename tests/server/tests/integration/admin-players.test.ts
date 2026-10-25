import { config } from '@rctf/config'
import { createDatabase, players, users } from '@rctf/db'
import {
  BadPerms,
  BadPlayerAlreadyInTeam,
  BadPlayerNoTeam,
  BadPlayerNotFound,
  BadTeamFull,
  BadUnknownUser,
  GoodAdminPlayerDelete,
  GoodAdminPlayers,
  GoodAdminPlayerUpdate,
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
import { eq, inArray } from 'drizzle-orm'
import type { Hono } from 'hono'
import { createRedis } from '../../../../apps/api/src/util/redis'
import { updateSettings } from '../../../../apps/api/src/services/settings'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateAuthToken,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db

let app: Hono<any>
let adminToken: string
const cleanups: Array<() => Promise<void>> = []
const playerIds: string[] = []
const teamIds: string[] = []

const createTeam = async () => {
  const team = await generateRealTestUser()
  cleanups.push(team.cleanup)
  teamIds.push(team.user.id)
  return team.user
}

const createPlayer = async (
  name: string,
  team: { id: string } | null = null,
  isCaptain = false
) => {
  const id = crypto.randomUUID()
  playerIds.push(id)
  await getDb()
    .insert(players)
    .values({
      id,
      discordId: String(10n ** 17n + BigInt(playerIds.length)),
      discordUsername: `${name}-${id.slice(0, 6)}`,
      displayName: name,
      teamId: team?.id ?? null,
      isCaptain,
      joinedTeamAt: team ? new Date().toISOString() : null,
    })
  return id
}

const playerRow = (id: string) =>
  getDb()
    .select()
    .from(players)
    .where(eq(players.id, id))
    .then(rows => rows[0])

const adminRequest = (
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {}
) =>
  request(app, path, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${init.token ?? adminToken}`,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })

const setTeam = (playerId: string, teamId: string | null) =>
  adminRequest(`/api/v2/admin/players/${playerId}/team`, {
    method: 'PUT',
    body: { teamId },
  })

beforeAll(async () => {
  app = await getApp()
  const admin = await generateRealTestUser(Permissions.usersWrite)
  cleanups.push(admin.cleanup)
  adminToken = await generateAuthToken(admin.user.id)
})

beforeEach(async () => {
  await updateSettings(getDb(), { maxTeamSize: null }, await createRedis())
})

afterAll(async () => {
  const db = getDb()
  if (playerIds.length > 0) {
    await db.delete(players).where(inArray(players.id, playerIds))
  }
  await updateSettings(db, { maxTeamSize: null }, await createRedis())
  for (const cleanup of cleanups) {
    await cleanup()
  }
})

describe('admin players', () => {
  test('lists players with their team, and filters by search and role', async () => {
    const team = await createTeam()
    const captain = await createPlayer('zephyrcap', team, true)
    const member = await createPlayer('zephyrmem', team)
    const loner = await createPlayer('zephyrsolo')

    const all = await expectResponse(
      await adminRequest(
        '/api/v2/admin/players?limit=100&offset=0&search=zephyr'
      ),
      GoodAdminPlayers
    )
    expect(all.data.total).toBe(3)
    const byId = new Map(all.data.players.map((p: any) => [p.id, p]))
    expect(byId.get(captain)).toMatchObject({
      isCaptain: true,
      team: { id: team.id, name: team.name, isAdmin: false, banned: false },
    })
    expect(byId.get(loner)).toMatchObject({ team: null, joinedTeamAt: null })

    const roles = await expectResponse(
      await adminRequest(
        '/api/v2/admin/players?limit=100&offset=0&search=zephyr&roles=member,noTeam'
      ),
      GoodAdminPlayers
    )
    expect(roles.data.players.map((p: any) => p.id).sort()).toEqual(
      [member, loner].sort()
    )

    const byTeamName = await expectResponse(
      await adminRequest(
        `/api/v2/admin/players?limit=100&offset=0&search=${encodeURIComponent(team.name)}`
      ),
      GoodAdminPlayers
    )
    expect(byTeamName.data.players.map((p: any) => p.id).sort()).toEqual(
      [captain, member].sort()
    )
  })

  test('requires the manage-teams permission', async () => {
    const player = await generateRealTestUser()
    cleanups.push(player.cleanup)
    await expectResponse(
      await adminRequest('/api/v2/admin/players?limit=10&offset=0', {
        token: await generateAuthToken(player.user.id),
      }),
      BadPerms
    )
  })

  test('moves a captain to another team and hands over the captaincy', async () => {
    const from = await createTeam()
    const to = await createTeam()
    const captain = await createPlayer('mover', from, true)
    const member = await createPlayer('stayer', from)
    const resident = await createPlayer('resident', to, true)

    const moved = await expectResponse(
      await setTeam(captain, to.id),
      GoodAdminPlayerUpdate
    )
    expect(moved.data).toMatchObject({
      isCaptain: false,
      team: { id: to.id },
    })
    expect((await playerRow(member))?.isCaptain).toBe(true)
    expect((await playerRow(resident))?.isCaptain).toBe(true)
  })

  test('a player moved into an empty team becomes its captain', async () => {
    const empty = await createTeam()
    const loner = await createPlayer('newlead')
    const moved = await expectResponse(
      await setTeam(loner, empty.id),
      GoodAdminPlayerUpdate
    )
    expect(moved.data).toMatchObject({
      isCaptain: true,
      team: { id: empty.id },
    })
  })

  test('removing the last member keeps the team and its solves', async () => {
    const team = await createTeam()
    const only = await createPlayer('lastone', team, true)

    const removed = await expectResponse(
      await setTeam(only, null),
      GoodAdminPlayerUpdate
    )
    expect(removed.data).toMatchObject({ team: null, isCaptain: false })
    const kept = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, team.id))
    expect(kept).toHaveLength(1)
  })

  test('respects the team size limit and rejects bad targets', async () => {
    const team = await createTeam()
    await createPlayer('full1', team, true)
    const outsider = await createPlayer('outsider')
    await updateSettings(getDb(), { maxTeamSize: 1 }, await createRedis())

    await expectResponse(await setTeam(outsider, team.id), BadTeamFull)
    await expectResponse(await setTeam(outsider, null), BadPlayerNoTeam)
    await expectResponse(
      await setTeam(outsider, crypto.randomUUID()),
      BadUnknownUser
    )
    await expectResponse(
      await setTeam(crypto.randomUUID(), team.id),
      BadPlayerNotFound
    )

    const member = await createPlayer('already', await createTeam(), true)
    const memberTeam = (await playerRow(member))!.teamId!
    await expectResponse(
      await setTeam(member, memberTeam),
      BadPlayerAlreadyInTeam
    )
  })

  test('makes a member captain', async () => {
    const team = await createTeam()
    const captain = await createPlayer('oldcap', team, true)
    const member = await createPlayer('newcap', team)

    const promoted = await expectResponse(
      await adminRequest(`/api/v2/admin/players/${member}/captain`, {
        method: 'POST',
      }),
      GoodAdminPlayerUpdate
    )
    expect(promoted.data.isCaptain).toBe(true)
    expect((await playerRow(captain))?.isCaptain).toBe(false)

    const loner = await createPlayer('nocap')
    await expectResponse(
      await adminRequest(`/api/v2/admin/players/${loner}/captain`, {
        method: 'POST',
      }),
      BadPlayerNoTeam
    )
  })

  test('deletes a player and keeps their team running', async () => {
    const team = await createTeam()
    const captain = await createPlayer('gonecap', team, true)
    const member = await createPlayer('heir', team)

    await expectResponse(
      await adminRequest(`/api/v2/admin/players/${captain}`, {
        method: 'DELETE',
      }),
      GoodAdminPlayerDelete
    )
    expect(await playerRow(captain)).toBeUndefined()
    expect((await playerRow(member))?.isCaptain).toBe(true)

    await expectResponse(
      await adminRequest(`/api/v2/admin/players/${captain}`, {
        method: 'DELETE',
      }),
      BadPlayerNotFound
    )
  })
})
