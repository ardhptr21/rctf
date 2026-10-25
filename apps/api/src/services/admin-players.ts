import { players, users, type DatabaseClient } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import {
  ADMIN_PERMISSIONS,
  AdminPlayerRole,
  AdminPlayerStatus,
} from '@rctf/types'
import type { TypedRedis } from '../cache/scripts'
import { invalidatePlayerCache } from './players'
import { and, count, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&')

const playerSelection = {
  id: players.id,
  discordId: players.discordId,
  discordUsername: players.discordUsername,
  displayName: players.displayName,
  avatarUrl: players.avatarUrl,
  isCaptain: players.isCaptain,
  banned: players.banned,
  joinedTeamAt: players.joinedTeamAt,
  createdAt: players.createdAt,
  teamId: users.id,
  teamName: users.name,
  teamPerms: users.perms,
  teamBanned: users.banned,
}

type PlayerRow = {
  id: string
  discordId: string
  discordUsername: string
  displayName: string | null
  avatarUrl: string | null
  isCaptain: boolean
  banned: boolean
  joinedTeamAt: string | null
  createdAt: string
  teamId: string | null
  teamName: string | null
  teamPerms: number | null
  teamBanned: boolean | null
}

export type AdminPlayer = ReturnType<typeof toAdminPlayer>

const toAdminPlayer = (row: PlayerRow) => ({
  id: row.id,
  discordId: row.discordId,
  discordUsername: row.discordUsername,
  displayName: row.displayName,
  avatarUrl: row.avatarUrl,
  isCaptain: row.teamId !== null && row.isCaptain,
  banned: row.banned,
  team:
    row.teamId !== null
      ? {
          id: row.teamId,
          name: row.teamName ?? '',
          isAdmin: ((row.teamPerms ?? 0) & ADMIN_PERMISSIONS) !== 0,
          banned: row.teamBanned ?? false,
        }
      : null,
  joinedTeamAt:
    row.teamId !== null && row.joinedTeamAt
      ? new Date(row.joinedTeamAt).getTime()
      : null,
  createdAt: new Date(row.createdAt).getTime(),
})

const roleFilter = (role: AdminPlayerRole): SQL => {
  switch (role) {
    case AdminPlayerRole.CAPTAIN:
      return and(sql`${users.id} IS NOT NULL`, eq(players.isCaptain, true))!
    case AdminPlayerRole.MEMBER:
      return and(sql`${users.id} IS NOT NULL`, eq(players.isCaptain, false))!
    case AdminPlayerRole.NO_TEAM:
      return isNull(users.id)
  }
}

const searchFilter = (search: string): SQL => {
  const pattern = `%${escapeLikePattern(search.toLowerCase())}%`
  const like = (column: SQL | typeof players.discordUsername) =>
    sql`lower(${column}) LIKE ${pattern} ESCAPE ${'\\'}`
  return or(
    like(players.discordUsername),
    like(sql`coalesce(${players.displayName}, '')`),
    eq(players.discordId, search.trim()),
    like(sql`coalesce(${users.name}, '')`)
  )!
}

export const listAdminPlayers = async (
  db: DatabaseClient,
  params: {
    limit: number
    offset: number
    search?: string | undefined
    roles?: AdminPlayerRole[] | undefined
    statuses?: AdminPlayerStatus[] | undefined
  }
) => {
  const roles = [...new Set(params.roles ?? [])]
  const statuses = new Set(params.statuses ?? [])
  // both statuses (or neither) means no status filter
  const statusFilter =
    statuses.size === 1
      ? eq(players.banned, statuses.has(AdminPlayerStatus.BANNED))
      : undefined
  const where = and(
    params.search ? searchFilter(params.search) : undefined,
    roles.length > 0 ? or(...roles.map(roleFilter)) : undefined,
    statusFilter
  )

  const [rows, totalRow] = await Promise.all([
    db
      .select(playerSelection)
      .from(players)
      .leftJoin(users, eq(users.id, players.teamId))
      .where(where)
      .orderBy(desc(players.createdAt), desc(players.id))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ value: count() })
      .from(players)
      .leftJoin(users, eq(users.id, players.teamId))
      .where(where)
      .then(takeUnique),
  ])

  return {
    players: rows.map(toAdminPlayer),
    total: totalRow?.value ?? 0,
  }
}

export const getAdminPlayer = async (db: DatabaseClient, id: string) => {
  const row = await db
    .select(playerSelection)
    .from(players)
    .leftJoin(users, eq(users.id, players.teamId))
    .where(eq(players.id, id))
    .then(takeUnique)
  return row ? toAdminPlayer(row) : undefined
}

// A ban is kept on the player row, which is tied to the Discord account, so
// signing in again doesn't lift it. The player keeps their team membership.
export const setAdminPlayerBanned = async (
  db: DatabaseClient,
  redis: TypedRedis,
  id: string,
  banned: boolean
): Promise<boolean> => {
  const updated = await db
    .update(players)
    .set({ banned })
    .where(eq(players.id, id))
    .returning({ id: players.id })
  if (updated.length === 0) {
    return false
  }
  // the router checks the cached player on every request
  await invalidatePlayerCache(redis, [id])
  return true
}
