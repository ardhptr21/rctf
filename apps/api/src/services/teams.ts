import {
  players,
  solves,
  users,
  type DatabaseClient,
  type DatabaseTx,
  type Player,
  type User,
} from '@rctf/db'
import { getErrorConstraint, takeUnique } from '@rctf/db/util'
import { ADMIN_PERMISSIONS } from '@rctf/types'
import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import { invalidateUserCache } from '../cache/auth-cache'
import type { TypedRedis } from '../cache/scripts'
import { defaultDivision, divisionAllowed } from '../util/acl'
import { invalidatePlayerCache } from './players'
import { getCompetitionTiming, getResolvedSettings } from './settings'

export type TeamSummary = { id: string; name: string; division: string }

type TeamError =
  | 'badAlreadyInTeam'
  | 'badKnownName'
  | 'badDivisionNotAllowed'
  | 'badTeamCreationClosed'
  | 'badTeamToken'
  | 'badTeamFull'
  | 'badTeamBanned'
  | 'badNoTeam'
  | 'badNotCaptain'
  | 'badRosterLocked'
  | 'badUnknownPlayer'

export type TeamResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: TeamError }

const fail = (error: TeamError): { ok: false; error: TeamError } => ({
  ok: false,
  error,
})

const generateJoinToken = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url')

const toSummary = (team: Pick<User, 'id' | 'name' | 'division'>) => ({
  id: team.id,
  name: team.name,
  division: team.division,
})

// admin teams are not limited, so organizers can all share one team
export const teamSizeLimit = (
  team: Pick<User, 'perms'>,
  maxTeamSize: number
): number | null =>
  (team.perms & ADMIN_PERMISSIONS) !== 0 ? null : maxTeamSize

// rosters lock once the competition starts
export const isRosterLocked = async (
  db: DatabaseClient,
  redis: TypedRedis
): Promise<boolean> => {
  const { startTime } = await getCompetitionTiming(db, redis)
  return Date.now() >= startTime
}

const lockTeamRoster = (tx: DatabaseTx, teamId: string) =>
  tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${'team_roster:' + teamId}, 0))`
  )

const lockPlayer = (tx: DatabaseTx, playerId: string) =>
  tx
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .for('update')
    .then(takeUnique)

const countMembers = async (tx: DatabaseTx, teamId: string) =>
  (
    await tx
      .select({ value: count() })
      .from(players)
      .where(eq(players.teamId, teamId))
      .then(takeUnique)
  )?.value ?? 0

const invalidateMembership = async (
  redis: TypedRedis,
  teamId: string | null,
  playerIds: string[]
) => {
  await invalidatePlayerCache(redis, playerIds)
  if (teamId) {
    await invalidateUserCache(redis, teamId)
  }
}

export const getTeamSummary = async (
  db: DatabaseClient,
  teamId: string
): Promise<TeamSummary | undefined> => {
  const team = await db
    .select({ id: users.id, name: users.name, division: users.division })
    .from(users)
    .where(eq(users.id, teamId))
    .then(takeUnique)
  return team ? toSummary(team) : undefined
}

export const createTeam = async (
  db: DatabaseClient,
  redis: TypedRedis,
  player: Player,
  params: { name: string; division?: string | undefined }
): Promise<TeamResult<TeamSummary>> => {
  const { teamCreationEnabled } = await getResolvedSettings(db, redis)
  if (!teamCreationEnabled) {
    return fail('badTeamCreationClosed')
  }

  const division = params.division ?? defaultDivision
  if (!division || !divisionAllowed(null, division)) {
    return fail('badDivisionNotAllowed')
  }

  let result: TeamResult<TeamSummary>
  try {
    result = await db.transaction(async tx => {
      const current = await lockPlayer(tx, player.id)
      if (!current || current.teamId) {
        return fail('badAlreadyInTeam')
      }

      const [team] = await tx
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          name: params.name,
          division,
          perms: 0,
          joinToken: generateJoinToken(),
        })
        .returning()
      await tx
        .update(players)
        .set({
          teamId: team!.id,
          isCaptain: true,
          joinedTeamAt: new Date().toISOString(),
        })
        .where(eq(players.id, player.id))
      return { ok: true as const, value: toSummary(team!) }
    })
  } catch (error) {
    if (getErrorConstraint(error) === 'users_name_key') {
      return fail('badKnownName')
    }
    throw error
  }

  await invalidatePlayerCache(redis, [player.id])
  return result
}

export const joinTeam = async (
  db: DatabaseClient,
  redis: TypedRedis,
  player: Player,
  joinToken: string
): Promise<TeamResult<TeamSummary>> => {
  const team = await db
    .select()
    .from(users)
    .where(eq(users.joinToken, joinToken))
    .then(takeUnique)
  if (!team) {
    return fail('badTeamToken')
  }
  if (team.banned) {
    return fail('badTeamBanned')
  }

  const { maxTeamSize } = await getResolvedSettings(db, redis)
  const result = await db.transaction(async tx => {
    await lockTeamRoster(tx, team.id)
    const current = await lockPlayer(tx, player.id)
    if (!current || current.teamId) {
      return fail('badAlreadyInTeam')
    }

    const limit = teamSizeLimit(team, maxTeamSize)
    if (limit !== null && (await countMembers(tx, team.id)) >= limit) {
      return fail('badTeamFull')
    }

    await tx
      .update(players)
      .set({
        teamId: team.id,
        isCaptain: false,
        joinedTeamAt: new Date().toISOString(),
      })
      .where(eq(players.id, player.id))
    return { ok: true as const, value: toSummary(team) }
  })

  if (result.ok) {
    await invalidateMembership(redis, team.id, [player.id])
  }
  return result
}

export const getTeamMembers = async (
  db: DatabaseClient,
  teamId: string
): Promise<Player[]> =>
  db
    .select()
    .from(players)
    .where(eq(players.teamId, teamId))
    .orderBy(asc(players.joinedTeamAt), asc(players.createdAt))

export const getJoinToken = async (
  db: DatabaseClient,
  teamId: string
): Promise<string> => {
  const team = await db
    .select({ joinToken: users.joinToken })
    .from(users)
    .where(eq(users.id, teamId))
    .then(takeUnique)
  if (team?.joinToken) {
    return team.joinToken
  }
  // teams created before player accounts have no token yet
  return await rotateJoinToken(db, teamId)
}

export const rotateJoinToken = async (
  db: DatabaseClient,
  teamId: string
): Promise<string> => {
  const joinToken = generateJoinToken()
  await db.update(users).set({ joinToken }).where(eq(users.id, teamId))
  return joinToken
}

// Returns the players whose captaincy changed. An emptied team with no
// solves is dropped so its name frees up, unless `keepEmptyTeam` is set.
const removeFromTeam = async (
  tx: DatabaseTx,
  teamId: string,
  playerId: string,
  wasCaptain: boolean,
  keepEmptyTeam = false
): Promise<string[]> => {
  await tx
    .update(players)
    .set({ teamId: null, isCaptain: false, joinedTeamAt: null })
    .where(eq(players.id, playerId))

  const remaining = await tx
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.teamId, teamId), ne(players.id, playerId)))
    .orderBy(asc(players.joinedTeamAt), asc(players.createdAt))

  if (remaining.length === 0) {
    if (keepEmptyTeam) {
      return []
    }
    const solveCount =
      (
        await tx
          .select({ value: count() })
          .from(solves)
          .where(eq(solves.userid, teamId))
          .then(takeUnique)
      )?.value ?? 0
    if (solveCount === 0) {
      await tx.delete(users).where(eq(users.id, teamId))
    }
    return []
  }

  if (wasCaptain) {
    await tx
      .update(players)
      .set({ isCaptain: true })
      .where(eq(players.id, remaining[0]!.id))
    return [remaining[0]!.id]
  }
  return []
}

export const leaveTeam = async (
  db: DatabaseClient,
  redis: TypedRedis,
  player: Player
): Promise<TeamResult> => {
  if (!player.teamId) {
    return fail('badNoTeam')
  }
  if (await isRosterLocked(db, redis)) {
    return fail('badRosterLocked')
  }

  const teamId = player.teamId
  const changed = await db.transaction(async tx => {
    await lockTeamRoster(tx, teamId)
    const current = await lockPlayer(tx, player.id)
    if (!current || current.teamId !== teamId) {
      return null
    }
    return removeFromTeam(tx, teamId, player.id, current.isCaptain)
  })
  if (changed === null) {
    return fail('badNoTeam')
  }

  await invalidateMembership(redis, teamId, [player.id, ...changed])
  return { ok: true, value: undefined }
}

const requireCaptain = (player: Player): TeamError | null => {
  if (!player.teamId) {
    return 'badNoTeam'
  }
  return player.isCaptain ? null : 'badNotCaptain'
}

export const removeTeamMember = async (
  db: DatabaseClient,
  redis: TypedRedis,
  captain: Player,
  targetId: string
): Promise<TeamResult> => {
  const error = requireCaptain(captain)
  if (error) {
    return fail(error)
  }
  if (targetId === captain.id) {
    return fail('badUnknownPlayer')
  }
  if (await isRosterLocked(db, redis)) {
    return fail('badRosterLocked')
  }

  const teamId = captain.teamId!
  const removed = await db.transaction(async tx => {
    await lockTeamRoster(tx, teamId)
    const target = await lockPlayer(tx, targetId)
    if (!target || target.teamId !== teamId) {
      return false
    }
    await removeFromTeam(tx, teamId, targetId, false)
    return true
  })
  if (!removed) {
    return fail('badUnknownPlayer')
  }

  await invalidateMembership(redis, teamId, [targetId])
  return { ok: true, value: undefined }
}

export const transferCaptain = async (
  db: DatabaseClient,
  redis: TypedRedis,
  captain: Player,
  targetId: string
): Promise<TeamResult> => {
  const error = requireCaptain(captain)
  if (error) {
    return fail(error)
  }

  const teamId = captain.teamId!
  const transferred = await db.transaction(async tx => {
    await lockTeamRoster(tx, teamId)
    const target = await lockPlayer(tx, targetId)
    if (!target || target.teamId !== teamId || target.id === captain.id) {
      return false
    }
    await tx
      .update(players)
      .set({ isCaptain: false })
      .where(eq(players.id, captain.id))
    await tx
      .update(players)
      .set({ isCaptain: true })
      .where(eq(players.id, targetId))
    return true
  })
  if (!transferred) {
    return fail('badUnknownPlayer')
  }

  await invalidatePlayerCache(redis, [captain.id, targetId])
  return { ok: true, value: undefined }
}

// Resolves a CLI target: a team email, a team name, or a member's Discord ID.
export const resolveTeamTarget = async (
  db: DatabaseClient,
  target: string
): Promise<User | undefined> => {
  const trimmed = target.trim()
  if (trimmed.includes('@')) {
    return db
      .select()
      .from(users)
      .where(eq(users.email, trimmed.toLowerCase()))
      .then(takeUnique)
  }

  if (/^\d{15,21}$/.test(trimmed)) {
    const player = await db
      .select({ teamId: players.teamId })
      .from(players)
      .where(eq(players.discordId, trimmed))
      .then(takeUnique)
    if (player?.teamId) {
      return db
        .select()
        .from(users)
        .where(eq(users.id, player.teamId))
        .then(takeUnique)
    }
  }

  return db.select().from(users).where(eq(users.name, trimmed)).then(takeUnique)
}

export type CreateAdminTeamResult =
  | { ok: true; team: User; joinToken: string; playerAttached: boolean }
  | { ok: false; error: 'badKnownName' | 'badKnownEmail' | 'badAlreadyInTeam' }

class PlayerAlreadyInTeam extends Error {}

// CLI bootstrap: an admin team, optionally with a Discord account as captain.
// A player created here gets their real Discord profile on first login.
export const createAdminTeam = async (
  db: DatabaseClient,
  redis: TypedRedis,
  params: {
    name: string
    perms: number
    division?: string | undefined
    email?: string | undefined
    discordId?: string | undefined
  }
): Promise<CreateAdminTeamResult> => {
  const joinToken = generateJoinToken()
  let playerId: string | null = null

  try {
    const result = await db.transaction(async tx => {
      const [team] = await tx
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          name: params.name,
          email: params.email ?? null,
          division: params.division ?? defaultDivision!,
          perms: params.perms,
          joinToken,
        })
        .returning()

      if (params.discordId) {
        const [player] = await tx
          .insert(players)
          .values({
            id: crypto.randomUUID(),
            discordId: params.discordId,
            discordUsername: params.discordId,
          })
          .onConflictDoUpdate({
            target: players.discordId,
            set: { discordId: params.discordId },
          })
          .returning()
        if (player!.teamId) {
          // throwing rolls back the team insert
          throw new PlayerAlreadyInTeam()
        }
        await tx
          .update(players)
          .set({
            teamId: team!.id,
            isCaptain: true,
            joinedTeamAt: new Date().toISOString(),
          })
          .where(eq(players.id, player!.id))
        playerId = player!.id
      }
      return team!
    })

    if (playerId) {
      await invalidatePlayerCache(redis, [playerId])
    }
    return {
      ok: true,
      team: result,
      joinToken,
      playerAttached: playerId !== null,
    }
  } catch (error) {
    if (error instanceof PlayerAlreadyInTeam) {
      return { ok: false, error: 'badAlreadyInTeam' }
    }
    const constraint = getErrorConstraint(error)
    if (constraint === 'users_name_key') {
      return { ok: false, error: 'badKnownName' }
    }
    if (constraint === 'users_email_key') {
      return { ok: false, error: 'badKnownEmail' }
    }
    throw error
  }
}

export type AdminPlayerError =
  | 'badPlayerNotFound'
  | 'badPlayerBanned'
  | 'badPlayerNoTeam'
  | 'badPlayerAlreadyInTeam'
  | 'badUnknownUser'
  | 'badTeamBanned'
  | 'badTeamFull'

export type AdminPlayerResult =
  | { ok: true }
  | { ok: false; error: AdminPlayerError }

class AdminPlayerFailure extends Error {
  constructor(readonly error: AdminPlayerError) {
    super(error)
  }
}

// Admin roster changes skip the roster lock, so organizers can fix teams
// during the CTF. Solves stay with the team, not the player, and a team an
// admin empties is kept so it can be managed (or deleted) on purpose.
const runAdminRosterChange = async (
  db: DatabaseClient,
  redis: TypedRedis,
  teamIds: Array<string | null>,
  change: (tx: DatabaseTx) => Promise<string[]>
): Promise<AdminPlayerResult> => {
  const rosters = [...new Set(teamIds.filter(id => id !== null))].sort()
  let changed: string[]
  try {
    changed = await db.transaction(async tx => {
      // a fixed lock order keeps two moves between the same teams from
      // deadlocking
      for (const id of rosters) {
        await lockTeamRoster(tx, id)
      }
      return await change(tx)
    })
  } catch (err) {
    if (err instanceof AdminPlayerFailure) {
      return { ok: false, error: err.error }
    }
    throw err
  }

  await invalidatePlayerCache(redis, changed)
  for (const id of rosters) {
    await invalidateUserCache(redis, id)
  }
  return { ok: true }
}

const lockAdminTarget = async (
  tx: DatabaseTx,
  playerId: string,
  expectedTeamId: string | null
): Promise<Player> => {
  const player = await lockPlayer(tx, playerId)
  if (!player) {
    throw new AdminPlayerFailure('badPlayerNotFound')
  }
  // the player moved between reading and locking: let the admin retry
  if (player.teamId !== expectedTeamId) {
    throw new AdminPlayerFailure('badPlayerNotFound')
  }
  return player
}

export const adminSetPlayerTeam = async (
  db: DatabaseClient,
  redis: TypedRedis,
  playerId: string,
  teamId: string | null
): Promise<AdminPlayerResult> => {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .then(takeUnique)
  if (!player) {
    return { ok: false, error: 'badPlayerNotFound' }
  }
  const fromTeamId = player.teamId
  if (teamId === null && fromTeamId === null) {
    return { ok: false, error: 'badPlayerNoTeam' }
  }
  if (teamId !== null && teamId === fromTeamId) {
    return { ok: false, error: 'badPlayerAlreadyInTeam' }
  }

  const team =
    teamId === null
      ? null
      : await db
          .select()
          .from(users)
          .where(eq(users.id, teamId))
          .then(takeUnique)
  if (teamId !== null && !team) {
    return { ok: false, error: 'badUnknownUser' }
  }
  if (team?.banned) {
    return { ok: false, error: 'badTeamBanned' }
  }
  const { maxTeamSize } = await getResolvedSettings(db, redis)

  return runAdminRosterChange(db, redis, [fromTeamId, teamId], async tx => {
    const current = await lockAdminTarget(tx, playerId, fromTeamId)
    const changed = [current.id]

    let members = 0
    if (team) {
      members = await countMembers(tx, team.id)
      const limit = teamSizeLimit(team, maxTeamSize)
      if (limit !== null && members >= limit) {
        throw new AdminPlayerFailure('badTeamFull')
      }
    }

    if (fromTeamId) {
      changed.push(
        ...(await removeFromTeam(
          tx,
          fromTeamId,
          current.id,
          current.isCaptain ?? false,
          true
        ))
      )
    }

    if (team) {
      // a player moved into an empty team leads it
      await tx
        .update(players)
        .set({
          teamId: team.id,
          isCaptain: members === 0,
          joinedTeamAt: new Date().toISOString(),
        })
        .where(eq(players.id, current.id))
    }
    return changed
  })
}

export const adminMakeCaptain = async (
  db: DatabaseClient,
  redis: TypedRedis,
  playerId: string
): Promise<AdminPlayerResult> => {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .then(takeUnique)
  if (!player) {
    return { ok: false, error: 'badPlayerNotFound' }
  }
  const teamId = player.teamId
  if (!teamId) {
    return { ok: false, error: 'badPlayerNoTeam' }
  }

  return runAdminRosterChange(db, redis, [teamId], async tx => {
    await lockAdminTarget(tx, playerId, teamId)
    const previous = await tx
      .update(players)
      .set({ isCaptain: false })
      .where(and(eq(players.teamId, teamId), eq(players.isCaptain, true)))
      .returning({ id: players.id })
    await tx
      .update(players)
      .set({ isCaptain: true })
      .where(eq(players.id, playerId))
    return [playerId, ...previous.map(row => row.id)]
  })
}

// Deletes the player account. Their team keeps its solves and, when the
// captain is deleted, the longest-serving member takes over. Signing in with
// Discord again creates a fresh player with no team.
export const adminDeletePlayer = async (
  db: DatabaseClient,
  redis: TypedRedis,
  playerId: string
): Promise<AdminPlayerResult> => {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .then(takeUnique)
  if (!player) {
    return { ok: false, error: 'badPlayerNotFound' }
  }
  // deleting the row would lift the ban: the next sign-in starts fresh
  if (player.banned) {
    return { ok: false, error: 'badPlayerBanned' }
  }
  const teamId = player.teamId

  return runAdminRosterChange(db, redis, [teamId], async tx => {
    const current = await lockAdminTarget(tx, playerId, teamId)
    const changed = [current.id]
    if (teamId) {
      changed.push(
        ...(await removeFromTeam(
          tx,
          teamId,
          current.id,
          current.isCaptain ?? false,
          true
        ))
      )
    }
    await tx.delete(players).where(eq(players.id, current.id))
    return changed
  })
}
