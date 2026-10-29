import { config } from '@rctf/config'
import { createDatabase, users } from '@rctf/db'
import {
  BadPerms,
  BadTeamsImport,
  GoodAdminTeamJoinCodes,
  GoodAdminTeamsImport,
  GoodAdminTeamsImportPreview,
  Permissions,
} from '@rctf/types'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import type { Hono } from 'hono'
import { importTeams } from '../../../../apps/api/src/services/team-import'
import { getTeamJoinCodes } from '../../../../apps/api/src/services/users'
import { getApp, request } from '../../app'
import {
  clearDatabase,
  expectResponse,
  generateAuthToken,
  generateRealTestUser,
} from '../../util'

let app: Hono<any>
const getDb = () => createDatabase(config.database.sql).db
const defaultDivision =
  config.defaultDivision || Object.keys(config.divisions)[0]!

beforeAll(async () => {
  app = await getApp()
})

beforeEach(async () => {
  await clearDatabase()
})

const adminToken = async (perms = Permissions.usersWrite) =>
  generateAuthToken((await generateRealTestUser(perms)).user.id)

const importCsv = async (token: string, csv: string, confirm: boolean) =>
  request(app, '/api/v2/admin/users/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ csv, confirm }),
  })

const teamsNamed = (names: string[]) =>
  getDb()
    .select({
      name: users.name,
      division: users.division,
      perms: users.perms,
      joinToken: users.joinToken,
    })
    .from(users)
    .where(inArray(users.name, names))

describe('team import', () => {
  const csv = 'name,division\nAlpha Team,college\nBeta Team,\n'

  test('a preview checks the file and creates nothing', async () => {
    const token = await adminToken()

    const body = await expectResponse(
      await importCsv(token, csv, false),
      GoodAdminTeamsImportPreview
    )

    expect(body.data).toEqual({
      teams: [
        { line: 2, name: 'Alpha Team', division: 'college' },
        { line: 3, name: 'Beta Team', division: defaultDivision },
      ],
      problems: [],
    })
    expect(await teamsNamed(['Alpha Team', 'Beta Team'])).toEqual([])
  })

  test('confirming creates every team with its own join code', async () => {
    const token = await adminToken()

    const body = await expectResponse(
      await importCsv(token, csv, true),
      GoodAdminTeamsImport
    )

    const created = body.data.teams as {
      name: string
      division: string
      joinToken: string
    }[]
    expect(created.map(team => [team.name, team.division])).toEqual([
      ['Alpha Team', 'college'],
      ['Beta Team', defaultDivision],
    ])
    expect(created[0]!.joinToken).not.toBe(created[1]!.joinToken)
    const stored = await teamsNamed(['Alpha Team', 'Beta Team'])
    expect(stored).toHaveLength(2)
    for (const team of stored) {
      expect(team.perms).toBe(0)
      expect(created.find(row => row.name === team.name)?.joinToken).toBe(
        team.joinToken!
      )
    }
  })

  test('reports every problem by line and creates nothing', async () => {
    const token = await adminToken()
    await getDb().insert(users).values({
      id: crypto.randomUUID(),
      name: 'Existing Team',
      division: defaultDivision,
      perms: 0,
    })
    const bad = [
      'name,division',
      'Fine Team,college',
      'existing team,college',
      'Fine team,hs',
      'X,hs',
      'Lost Team,nowhere',
      ',hs',
    ].join('\n')

    const preview = await expectResponse(
      await importCsv(token, bad, false),
      GoodAdminTeamsImportPreview
    )
    expect(preview.data.problems).toEqual([
      { line: 3, message: 'A team named "existing team" already exists.' },
      { line: 4, message: 'Name "Fine team" is already used on line 2.' },
      {
        line: 5,
        message: 'Name "X" must be 2-64 printable characters.',
      },
      { line: 6, message: 'Division "nowhere" does not exist.' },
      { line: 7, message: 'The team name is empty.' },
    ])

    const confirmed = await expectResponse(
      await importCsv(token, bad, true),
      BadTeamsImport
    )
    expect(confirmed.data.problems).toEqual(preview.data.problems)
    expect(await teamsNamed(['Fine Team', 'Lost Team'])).toEqual([])
  })

  test('a name taken after the preview stops the import', async () => {
    const token = await adminToken()
    await expectResponse(
      await importCsv(token, csv, false),
      GoodAdminTeamsImportPreview
    )
    await getDb().insert(users).values({
      id: crypto.randomUUID(),
      name: 'Beta Team',
      division: defaultDivision,
      perms: 0,
    })

    const result = await importTeams(getDb(), csv)
    expect(result).toEqual({
      ok: false,
      problems: [
        { line: 3, message: 'A team named "Beta Team" already exists.' },
      ],
    })
    expect(await teamsNamed(['Alpha Team'])).toEqual([])
  })

  test('requires the manage-teams permission', async () => {
    const token = await adminToken(Permissions.challsRead)

    await expectResponse(await importCsv(token, csv, false), BadPerms)
  })
})

describe('join code export', () => {
  const exportCodes = async (
    token: string,
    body: Record<string, unknown>,
    query = ''
  ) =>
    request(app, `/api/v2/admin/users/join-codes${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

  // three imported teams, one of them banned, and one registered by email
  const seed = async () => {
    const result = await importTeams(
      getDb(),
      'name,division\nCharlie Team,college\nAlpha Team,college\nBravo Team,hs\n'
    )
    if (!result.ok) throw new Error('import failed')
    await getDb()
      .update(users)
      .set({ banned: true })
      .where(eq(users.name, 'Bravo Team'))
    await getDb()
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        name: 'Email Team',
        email: `${crypto.randomUUID()}@example.com`,
        division: 'college',
        perms: 0,
      })
    return new Map(result.teams.map(team => [team.name, team.joinToken]))
  }

  test('lists every matching team with its join code, in the sort', async () => {
    const token = await adminToken()
    const codes = await seed()

    const body = await expectResponse(
      await exportCodes(
        token,
        { division: { include: ['college'] } },
        '?sortBy=team&sortOrder=asc'
      ),
      GoodAdminTeamJoinCodes
    )

    expect(
      body.data.teams.map((team: any) => [team.name, team.joinToken])
    ).toEqual([
      ['Alpha Team', codes.get('Alpha Team')],
      ['Charlie Team', codes.get('Charlie Team')],
      // registered by email, so players can't join it
      ['Email Team', null],
    ])
  })

  test('follows the status filter and search', async () => {
    const token = await adminToken()
    await seed()

    const banned = await expectResponse(
      await exportCodes(token, { status: { include: ['banned'] } }),
      GoodAdminTeamJoinCodes
    )
    expect(banned.data.teams).toMatchObject([
      { name: 'Bravo Team', banned: true },
    ])

    const searched = await expectResponse(
      await exportCodes(token, {}, '?search=charlie'),
      GoodAdminTeamJoinCodes
    )
    expect(searched.data.teams.map((team: any) => team.name)).toEqual([
      'Charlie Team',
    ])
  })

  test('refuses more teams than one export holds', async () => {
    await seed()
    expect(await getTeamJoinCodes(getDb(), {}, 3)).toEqual({
      tooMany: true,
      total: 4,
    })
    const fits = await getTeamJoinCodes(getDb(), {}, 4)
    expect(fits.tooMany).toBe(false)
  })

  test('requires the manage-teams permission', async () => {
    const token = await adminToken(Permissions.challsRead)
    await expectResponse(await exportCodes(token, {}), BadPerms)
  })
})
