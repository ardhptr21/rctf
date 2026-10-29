import { config } from '@rctf/config'
import { createDatabase, players, settings, users } from '@rctf/db'
import {
  ALL_PERMISSIONS,
  BadAlreadyInTeam,
  BadBody,
  BadDiscordCode,
  BadDiscordGuild,
  BadEndpoint,
  BadFlag,
  BadNoTeam,
  BadNotCaptain,
  BadPlayerBanned,
  BadRosterLocked,
  BadTeamCreationClosed,
  BadTeamFull,
  BadTeamToken,
  BadToken,
  GoodDiscordLogin,
  GoodFlag,
  GoodPlayerSelf,
  GoodTeamCaptainTransfer,
  GoodTeamCreate,
  GoodTeamJoin,
  GoodTeamLeave,
  GoodTeamMemberRemove,
  GoodTeamMembers,
  GoodTeamTokenRotate,
  GoodUserSelfDataV2,
  GoodChallengesV2,
  GoodAdminPlayers,
  GoodAdminSubmissions,
  GoodAdminPlayerUpdate,
  PageAccess,
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
import { eq, inArray } from 'drizzle-orm'
import type { Hono } from 'hono'
import {
  invalidateResolvedSettingsCache,
  updateSettings,
} from '../../../../apps/api/src/services/settings'
import { invalidatePlayerCache } from '../../../../apps/api/src/services/players'
import {
  createAdminTeam,
  resolveTeamTarget,
} from '../../../../apps/api/src/services/teams'
import { createRedis } from '../../../../apps/api/src/util/redis'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateAuthToken,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db

const redirectUri = new URL('/login/discord', config.origin).toString()

let app: Hono<any>
let guildIds: string[] = []
const realFetch = globalThis.fetch
const originalDiscord = config.discord
const createdDiscordIds = new Set<string>()

// Discord's OAuth API is stubbed: the authorization code is the Discord ID
const stubDiscordFetch = async (
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  if (!url.startsWith('https://discord.com/api/')) {
    return realFetch(input, init)
  }

  if (url.endsWith('/oauth2/token')) {
    const code = new URLSearchParams(init!.body as string).get('code')!
    if (code === 'bad') {
      return new Response('{"error":"invalid_grant"}', { status: 400 })
    }
    return Response.json({
      access_token: `token-${code}`,
      token_type: 'Bearer',
    })
  }

  const auth = new Headers(init?.headers).get('Authorization') ?? ''
  const discordId = auth.replace('Bearer token-', '')
  if (url.endsWith('/users/@me')) {
    return Response.json({
      id: discordId,
      username: `user${discordId.slice(-4)}`,
      global_name: `Player ${discordId.slice(-4)}`,
      avatar: 'abc',
    })
  }
  if (url.endsWith('/users/@me/guilds')) {
    return Response.json(guildIds.map(id => ({ id })))
  }
  return new Response('not found', { status: 404 })
}

const newDiscordId = () => {
  const id = `${Date.now()}${Math.floor(Math.random() * 1e6)}`.slice(0, 18)
  createdDiscordIds.add(id)
  return id
}

const post = (path: string, token: string | null, body?: unknown) =>
  request(app, path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const get = (path: string, token: string) =>
  request(app, path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

const login = async (discordId = newDiscordId()) => {
  const body = await expectResponse(
    await post('/api/v2/auth/discord', null, { code: discordId, redirectUri }),
    GoodDiscordLogin
  )
  return { token: body.data.authToken as string, discordId }
}

const createTeam = async (token: string) => {
  const body = await expectResponse(
    await post('/api/v2/teams', token, { name: crypto.randomUUID() }),
    GoodTeamCreate
  )
  return body.data as { id: string; name: string }
}

const joinToken = async (captainToken: string) => {
  const body = await expectResponse(
    await get('/api/v2/teams/me/members', captainToken),
    GoodTeamMembers
  )
  return body.data.joinToken as string
}

const playerId = async (token: string) => {
  const body = await expectResponse(
    await get('/api/v2/players/me', token),
    GoodPlayerSelf
  )
  return body.data.player.id as string
}

const setStartTime = async (startTime: number) => {
  const redis = await createRedis()
  await updateSettings(getDb(), { startTime }, redis)
}

const resetSettings = async () => {
  const redis = await createRedis()
  await getDb().delete(settings).where(eq(settings.id, 'value-0'))
  await invalidateResolvedSettingsCache(redis)
}

beforeAll(async () => {
  app = await getApp()
  globalThis.fetch = stubDiscordFetch as typeof fetch
  config.discord = { clientId: 'client-id', clientSecret: 'client-secret' }
})

afterEach(async () => {
  guildIds = []
  config.discord = { clientId: 'client-id', clientSecret: 'client-secret' }
  await resetSettings()
})

afterAll(async () => {
  globalThis.fetch = realFetch
  config.discord = originalDiscord
  const db = getDb()
  const created = await db
    .select({ teamId: players.teamId })
    .from(players)
    .where(inArray(players.discordId, [...createdDiscordIds]))
  const teamIds = created.map(p => p.teamId).filter((id): id is string => !!id)
  await db
    .delete(players)
    .where(inArray(players.discordId, [...createdDiscordIds]))
  if (teamIds.length > 0) {
    await db.delete(users).where(inArray(users.id, teamIds))
  }
})

describe('Discord login', () => {
  test('creates a player on first login and refreshes it after', async () => {
    const { token, discordId } = await login()
    const first = await expectResponse(
      await get('/api/v2/players/me', token),
      GoodPlayerSelf
    )
    expect(first.data.player.discordId).toBe(discordId)
    expect(first.data.player.avatarUrl).toContain(`/avatars/${discordId}/abc`)
    expect(first.data.team).toBeNull()
    expect(first.data.maxTeamSize).toBe(config.maxTeamSize)

    const again = await login(discordId)
    expect(await playerId(again.token)).toBe(first.data.player.id)
  })

  test('rejects an invalid code', async () => {
    await expectResponse(
      await post('/api/v2/auth/discord', null, { code: 'bad', redirectUri }),
      BadDiscordCode
    )
  })

  test('rejects an unexpected redirect URI', async () => {
    await expectResponse(
      await post('/api/v2/auth/discord', null, {
        code: newDiscordId(),
        redirectUri: 'https://evil.example/login/discord',
      }),
      BadBody
    )
  })

  test('enforces the required server', async () => {
    config.discord = {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      requiredGuildId: '42',
    }
    guildIds = ['7']
    await expectResponse(
      await post('/api/v2/auth/discord', null, {
        code: newDiscordId(),
        redirectUri,
      }),
      BadDiscordGuild
    )

    guildIds = ['7', '42']
    await login()
  })

  test('is unavailable without Discord config', async () => {
    config.discord = undefined
    await expectResponse(
      await post('/api/v2/auth/discord', null, {
        code: newDiscordId(),
        redirectUri,
      }),
      BadEndpoint
    )
  })

  test('admins cannot create team login tokens in Discord mode', async () => {
    const admin = await generateRealTestUser(Permissions.usersWrite)
    const team = await generateRealTestUser()
    try {
      const adminToken = await generateAuthToken(admin.user.id)
      await expectResponse(
        await post(`/api/v2/admin/users/${team.user.id}/token`, adminToken),
        BadEndpoint
      )
    } finally {
      await team.cleanup()
      await admin.cleanup()
    }
  })

  test('disables legacy registration in Discord mode', async () => {
    await expectResponse(
      await post('/api/v2/auth/register', null, {
        name: crypto.randomUUID(),
        email: `${crypto.randomUUID()}@example.com`,
      }),
      BadEndpoint
    )
  })
})

describe('players without a team', () => {
  test('cannot use team routes', async () => {
    const { token } = await login()
    await expectResponse(await get('/api/v2/users/me', token), BadNoTeam)

    const { challenge, cleanup } = await generateChallenge()
    try {
      await expectResponse(
        await post(`/api/v1/challs/${challenge.id}/submit`, token, {
          flag: challenge.flag,
        }),
        BadNoTeam
      )
    } finally {
      await cleanup()
    }
  })

  test('cannot view challenges, even when the page is public', async () => {
    const { token } = await login()
    const { challenge, cleanup } = await generateChallenge()
    try {
      await expectResponse(await get('/api/v2/challs', token), BadNoTeam)
      await expectResponse(await get('/api/v1/challs', token), BadNoTeam)
      await expectResponse(
        await get(
          `/api/v2/challs/${challenge.id}/solves?limit=10&offset=0`,
          token
        ),
        BadNoTeam
      )

      // once on a team, the same player can see them
      await createTeam(token)
      await expectResponse(await get('/api/v2/challs', token), GoodChallengesV2)
    } finally {
      await cleanup()
    }
  })

  test('gets badNoTeam, not a logout, on a private scoreboard', async () => {
    await updateSettings(
      getDb(),
      { pageAccess: { scores: PageAccess.Private } },
      await createRedis()
    )
    const { token } = await login()
    await expectResponse(
      await get('/api/v2/leaderboard/now?limit=10&offset=0', token),
      BadNoTeam
    )
  })

  test('cannot list team members', async () => {
    const { token } = await login()
    await expectResponse(
      await get('/api/v2/teams/me/members', token),
      BadNoTeam
    )
  })
})

describe('teams', () => {
  test('a player can create a team and becomes captain', async () => {
    const { token } = await login()
    const team = await createTeam(token)

    const self = await expectResponse(
      await get('/api/v2/players/me', token),
      GoodPlayerSelf
    )
    expect(self.data.team.id).toBe(team.id)
    expect(self.data.player.isCaptain).toBe(true)

    const userSelf = await expectResponse(
      await get('/api/v2/users/me', token),
      GoodUserSelfDataV2
    )
    expect(userSelf.data.id).toBe(team.id)

    await expectResponse(
      await post('/api/v2/teams', token, { name: crypto.randomUUID() }),
      BadAlreadyInTeam
    )
  })

  test('players join with the team token and solves count for the team', async () => {
    const captain = await login()
    const team = await createTeam(captain.token)
    const member = await login()

    await expectResponse(
      await post('/api/v2/teams/join', member.token, {
        token: await joinToken(captain.token),
      }),
      GoodTeamJoin
    )

    const members = await expectResponse(
      await get('/api/v2/teams/me/members', member.token),
      GoodTeamMembers
    )
    expect(members.data.members).toHaveLength(2)
    // only the captain sees the join token
    expect(members.data.joinToken).toBeNull()

    const { challenge, cleanup } = await generateChallenge()
    try {
      await expectResponse(
        await post(`/api/v1/challs/${challenge.id}/submit`, member.token, {
          flag: challenge.flag,
        }),
        GoodFlag
      )
      const userSelf = await expectResponse(
        await get('/api/v2/users/me', captain.token),
        GoodUserSelfDataV2
      )
      expect(userSelf.data.id).toBe(team.id)
      expect(userSelf.data.solves.map((s: any) => s.id)).toContain(challenge.id)
    } finally {
      await cleanup()
    }
  })

  test('team creation can be closed while joining stays open', async () => {
    const captain = await login()
    await createTeam(captain.token)
    const code = await joinToken(captain.token)

    const redis = await createRedis()
    await updateSettings(getDb(), { teamCreationEnabled: false }, redis)

    const player = await login()
    await expectResponse(
      await post('/api/v2/teams', player.token, { name: crypto.randomUUID() }),
      BadTeamCreationClosed
    )
    await expectResponse(
      await post('/api/v2/teams/join', player.token, { token: code }),
      GoodTeamJoin
    )

    const clientConfig = await (
      await request(app, '/api/v2/integrations/client/config', {
        method: 'GET',
      })
    ).json()
    expect(clientConfig.data.teamCreationEnabled).toBe(false)
  })

  test('rejects an unknown join token', async () => {
    const { token } = await login()
    await expectResponse(
      await post('/api/v2/teams/join', token, { token: 'nope' }),
      BadTeamToken
    )
  })

  test('enforces the team size limit', async () => {
    const captain = await login()
    await createTeam(captain.token)
    const code = await joinToken(captain.token)

    for (let i = 1; i < config.maxTeamSize; i++) {
      const member = await login()
      await expectResponse(
        await post('/api/v2/teams/join', member.token, { token: code }),
        GoodTeamJoin
      )
    }

    const extra = await login()
    await expectResponse(
      await post('/api/v2/teams/join', extra.token, { token: code }),
      BadTeamFull
    )
  })

  test('the team size limit can be changed from the settings', async () => {
    await updateSettings(getDb(), { maxTeamSize: 2 }, await createRedis())

    const captain = await login()
    await createTeam(captain.token)
    const code = await joinToken(captain.token)

    const self = await expectResponse(
      await get('/api/v2/players/me', captain.token),
      GoodPlayerSelf
    )
    expect(self.data.maxTeamSize).toBe(2)

    const second = await login()
    await expectResponse(
      await post('/api/v2/teams/join', second.token, { token: code }),
      GoodTeamJoin
    )
    const third = await login()
    await expectResponse(
      await post('/api/v2/teams/join', third.token, { token: code }),
      BadTeamFull
    )

    const members = await expectResponse(
      await get('/api/v2/teams/me/members', captain.token),
      GoodTeamMembers
    )
    expect(members.data.maxTeamSize).toBe(2)
  })

  test('concurrent joins never exceed the limit', async () => {
    const captain = await login()
    await createTeam(captain.token)
    const code = await joinToken(captain.token)

    const joiners = await Promise.all(
      Array.from({ length: config.maxTeamSize + 2 }, () => login())
    )
    const results = await Promise.all(
      joiners.map(async j =>
        (await post('/api/v2/teams/join', j.token, { token: code })).json()
      )
    )
    const joined = results.filter(r => r.kind === GoodTeamJoin.kind)
    expect(joined).toHaveLength(config.maxTeamSize - 1)
  })

  test('admin teams have no size limit', async () => {
    const captain = await login()
    const team = await createTeam(captain.token)
    await getDb()
      .update(users)
      .set({ perms: ALL_PERMISSIONS })
      .where(eq(users.id, team.id))
    const code = await joinToken(captain.token)

    for (let i = 0; i < config.maxTeamSize + 1; i++) {
      const member = await login()
      await expectResponse(
        await post('/api/v2/teams/join', member.token, { token: code }),
        GoodTeamJoin
      )
    }

    const members = await expectResponse(
      await get('/api/v2/teams/me/members', captain.token),
      GoodTeamMembers
    )
    expect(members.data.maxTeamSize).toBeNull()
    expect(members.data.members).toHaveLength(config.maxTeamSize + 2)
  })

  test('only the captain manages the team', async () => {
    const captain = await login()
    await createTeam(captain.token)
    const member = await login()
    await post('/api/v2/teams/join', member.token, {
      token: await joinToken(captain.token),
    })

    await expectResponse(
      await post('/api/v2/teams/me/token', member.token),
      BadNotCaptain
    )
    await expectResponse(
      await request(app, '/api/v2/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${member.token}`,
        },
        body: JSON.stringify({ name: crypto.randomUUID() }),
      }),
      BadNotCaptain
    )
  })

  test('rotating the token invalidates the old one', async () => {
    const captain = await login()
    await createTeam(captain.token)
    const oldToken = await joinToken(captain.token)

    const rotated = await expectResponse(
      await post('/api/v2/teams/me/token', captain.token),
      GoodTeamTokenRotate
    )
    expect(rotated.data.joinToken).not.toBe(oldToken)

    const member = await login()
    await expectResponse(
      await post('/api/v2/teams/join', member.token, { token: oldToken }),
      BadTeamToken
    )
    await expectResponse(
      await post('/api/v2/teams/join', member.token, {
        token: rotated.data.joinToken,
      }),
      GoodTeamJoin
    )
  })

  test('captaincy can be transferred', async () => {
    const captain = await login()
    await createTeam(captain.token)
    const member = await login()
    await post('/api/v2/teams/join', member.token, {
      token: await joinToken(captain.token),
    })

    await expectResponse(
      await post('/api/v2/teams/me/captain', captain.token, {
        playerId: await playerId(member.token),
      }),
      GoodTeamCaptainTransfer
    )
    await expectResponse(
      await post('/api/v2/teams/me/token', captain.token),
      BadNotCaptain
    )
    await expectResponse(
      await post('/api/v2/teams/me/token', member.token),
      GoodTeamTokenRotate
    )
  })
})

describe('roster lock', () => {
  test('players can leave and be removed before the CTF starts', async () => {
    await setStartTime(Date.now() + 60 * 60 * 1000)
    const captain = await login()
    await createTeam(captain.token)
    const code = await joinToken(captain.token)
    const kicked = await login()
    const stays = await login()
    await post('/api/v2/teams/join', kicked.token, { token: code })
    await post('/api/v2/teams/join', stays.token, { token: code })

    await expectResponse(
      await request(
        app,
        `/api/v2/teams/me/members/${await playerId(kicked.token)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${captain.token}` },
        }
      ),
      GoodTeamMemberRemove
    )
    const kickedSelf = await expectResponse(
      await get('/api/v2/players/me', kicked.token),
      GoodPlayerSelf
    )
    expect(kickedSelf.data.team).toBeNull()

    // the captain leaving hands captaincy to the next member
    await expectResponse(
      await post('/api/v2/teams/me/leave', captain.token),
      GoodTeamLeave
    )
    const staysSelf = await expectResponse(
      await get('/api/v2/players/me', stays.token),
      GoodPlayerSelf
    )
    expect(staysSelf.data.player.isCaptain).toBe(true)
  })

  test('the last player leaving drops a team with no solves', async () => {
    await setStartTime(Date.now() + 60 * 60 * 1000)
    const captain = await login()
    const team = await createTeam(captain.token)

    await expectResponse(
      await post('/api/v2/teams/me/leave', captain.token),
      GoodTeamLeave
    )
    expect(await resolveTeamTarget(getDb(), team.name)).toBeUndefined()
  })

  test('rosters are locked once the CTF starts', async () => {
    await setStartTime(Date.now() + 60 * 60 * 1000)
    const captain = await login()
    await createTeam(captain.token)
    const member = await login()
    await post('/api/v2/teams/join', member.token, {
      token: await joinToken(captain.token),
    })

    await setStartTime(Date.now() - 1000)
    await expectResponse(
      await post('/api/v2/teams/me/leave', member.token),
      BadRosterLocked
    )
    await expectResponse(
      await request(
        app,
        `/api/v2/teams/me/members/${await playerId(member.token)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${captain.token}` },
        }
      ),
      BadRosterLocked
    )

    // joining is still allowed after the start
    const late = await login()
    await expectResponse(
      await post('/api/v2/teams/join', late.token, {
        token: await joinToken(captain.token),
      }),
      GoodTeamJoin
    )
  })
})

describe('resolveTeamTarget', () => {
  test("finds a team by name or by a member's Discord ID", async () => {
    const captain = await login()
    const team = await createTeam(captain.token)

    expect((await resolveTeamTarget(getDb(), team.name))?.id).toBe(team.id)
    expect((await resolveTeamTarget(getDb(), captain.discordId))?.id).toBe(
      team.id
    )
  })
})

describe('player tokens', () => {
  test('a player whose account is gone is unauthenticated', async () => {
    const { token, discordId } = await login()
    const id = await playerId(token)
    await getDb().delete(players).where(eq(players.discordId, discordId))
    await invalidatePlayerCache(await createRedis(), [id])
    await expectResponse(await get('/api/v2/players/me', token), BadToken)
  })
})

describe('createAdminTeam', () => {
  test('creates an admin team with the Discord account as captain', async () => {
    const discordId = newDiscordId()
    const result = await createAdminTeam(getDb(), await createRedis(), {
      name: crypto.randomUUID(),
      perms: ALL_PERMISSIONS,
      discordId,
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.team.perms).toBe(ALL_PERMISSIONS)
    expect(result.playerAttached).toBe(true)

    // the first real login picks up the pre-created player and its team
    const { token } = await login(discordId)
    const self = await expectResponse(
      await get('/api/v2/players/me', token),
      GoodPlayerSelf
    )
    expect(self.data.team.id).toBe(result.team.id)
    expect(self.data.player.isCaptain).toBe(true)
    expect(self.data.player.discordUsername).toBe(`user${discordId.slice(-4)}`)

    // and other organizers can join with the token, past the size limit
    const code = await joinToken(token)
    expect(code).toBe(result.joinToken)
  })

  test('rejects a Discord account that is already on a team', async () => {
    const captain = await login()
    await createTeam(captain.token)
    const name = crypto.randomUUID()

    const result = await createAdminTeam(getDb(), await createRedis(), {
      name,
      perms: ALL_PERMISSIONS,
      discordId: captain.discordId,
    })
    expect(result).toEqual({ ok: false, error: 'badAlreadyInTeam' })
    // the team insert was rolled back
    expect(await resolveTeamTarget(getDb(), name)).toBeUndefined()
  })

  test('rejects a duplicate team name', async () => {
    const captain = await login()
    const team = await createTeam(captain.token)
    const result = await createAdminTeam(getDb(), await createRedis(), {
      name: team.name,
      perms: ALL_PERMISSIONS,
    })
    expect(result).toEqual({ ok: false, error: 'badKnownName' })
  })
})

describe('player bans', () => {
  test('a banned player is signed out and cannot sign in until unbanned', async () => {
    const admin = await generateRealTestUser(Permissions.usersWrite)
    try {
      const adminToken = await generateAuthToken(admin.user.id)
      const { token, discordId } = await login()
      const id = await playerId(token)
      const setBanned = (banned: boolean) =>
        request(app, `/api/v2/admin/players/${id}/ban`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ banned }),
        })

      const banned = await expectResponse(
        await setBanned(true),
        GoodAdminPlayerUpdate
      )
      expect(banned.data.banned).toBe(true)

      // the existing session stops working straight away
      await expectResponse(await get('/api/v2/players/me', token), BadToken)
      await expectResponse(
        await post('/api/v2/auth/discord', null, {
          code: discordId,
          redirectUri,
        }),
        BadPlayerBanned
      )

      const listed = await expectResponse(
        await get(
          `/api/v2/admin/players?limit=10&offset=0&statuses=banned&search=${discordId}`,
          adminToken
        ),
        GoodAdminPlayers
      )
      expect(listed.data.players.map((p: any) => p.id)).toEqual([id])

      // deleting would lift the ban, so it is refused
      await expectResponse(
        await request(app, `/api/v2/admin/players/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        BadPlayerBanned
      )

      await expectResponse(await setBanned(false), GoodAdminPlayerUpdate)
      const again = await login(discordId)
      expect(await playerId(again.token)).toBe(id)
    } finally {
      await admin.cleanup()
    }
  })
})

describe('submission players', () => {
  test('admin submissions show which player submitted', async () => {
    const admin = await generateRealTestUser(
      Permissions.usersWrite | Permissions.challsRead
    )
    const { challenge, cleanup } = await generateChallenge()
    try {
      const adminToken = await generateAuthToken(admin.user.id)
      const { token, discordId } = await login()
      const team = await createTeam(token)
      const id = await playerId(token)
      const submit = async (authToken: string) =>
        expectResponse(
          await post(`/api/v1/challs/${challenge.id}/submit`, authToken, {
            flag: 'flag{wrong}',
          }),
          BadFlag
        )

      await submit(token)
      // a team token has no player behind it
      await submit(await generateAuthToken(team.id))

      const list = async (extra = '') =>
        (
          await expectResponse(
            await get(
              `/api/v2/admin/submissions?limit=10&offset=0&challengeSearch=${challenge.name}${extra}`,
              adminToken
            ),
            GoodAdminSubmissions
          )
        ).data.submissions as any[]

      const rows = await list()
      expect(rows).toHaveLength(2)
      expect(rows.find(row => row.playerId === id)).toMatchObject({
        playerName: `Player ${discordId.slice(-4)}`,
        playerUsername: `user${discordId.slice(-4)}`,
      })
      expect(rows.filter(row => row.playerId === null)).toHaveLength(1)

      // the team search also matches the player
      const byPlayer = await list(`&teamSearch=user${discordId.slice(-4)}`)
      expect(byPlayer.map(row => row.playerId)).toEqual([id])
    } finally {
      await cleanup()
      await admin.cleanup()
    }
  })
})
