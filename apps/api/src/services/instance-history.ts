import {
  challenges,
  instanceHistory,
  players,
  users,
  type DatabaseClient,
  type InstanceHistoryEndpoint,
} from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import {
  InstanceEndReason,
  InstanceHistoryStatus,
  InstanceStatus,
  type FilterAdminInstancesRouteV2,
  type RouteBody,
  type RouteQuery,
} from '@rctf/types'
import { and, count, countDistinct, desc, eq, isNull, sql } from 'drizzle-orm'
import type { PgSelect } from 'drizzle-orm/pg-core'
import { setFilter } from '../lib/db-filters'
import type { PinoLogger } from 'hono-pino'
import type { instanceDetailsOrError } from '../providers/instancer/base'

// Who started an instance, for its history entry. Only player-facing
// instance routes pass it, so admins' own test instances aren't recorded.
export type InstanceHistoryContext = {
  playerId: string | null
  ip: string
  log: PinoLogger
}

export const instanceHistoryContext = (vars: {
  player?: { id: string } | null | undefined
  ip: string
  logger: PinoLogger
}): InstanceHistoryContext => ({
  playerId: vars.player?.id ?? null,
  ip: vars.ip,
  log: vars.logger,
})

type InstanceKey = { teamId: string; challengeId: string }

type OpenEntry = typeof instanceHistory.$inferSelect

const findOpenEntry = (
  db: DatabaseClient,
  { teamId, challengeId }: InstanceKey
) =>
  db
    .select()
    .from(instanceHistory)
    .where(
      and(
        eq(instanceHistory.teamId, teamId),
        eq(instanceHistory.challengeId, challengeId),
        isNull(instanceHistory.endedAt)
      )
    )
    .orderBy(desc(instanceHistory.startedAt))
    .limit(1)
    .then(takeUnique)

const closeEntry = (
  db: DatabaseClient,
  entry: OpenEntry,
  reason: InstanceEndReason,
  at: string
) =>
  db
    .update(instanceHistory)
    .set({ endedAt: at, endReason: reason })
    .where(
      and(eq(instanceHistory.id, entry.id), isNull(instanceHistory.endedAt))
    )

const hasExpired = (entry: OpenEntry, now: number) =>
  entry.expiresAt !== null && Date.parse(entry.expiresAt) <= now

// An instance that stopped on its own: expired if its time was up by then,
// otherwise it went away early.
const closeEnded = (
  db: DatabaseClient,
  entry: OpenEntry,
  now: number,
  reason: InstanceEndReason.GONE | InstanceEndReason.ERRORED
) =>
  hasExpired(entry, now)
    ? closeEntry(db, entry, InstanceEndReason.EXPIRED, entry.expiresAt!)
    : closeEntry(db, entry, reason, new Date(now).toISOString())

const expiresAtFrom = (timeLeft: number | null, now: number) =>
  timeLeft === null ? null : new Date(now + timeLeft).toISOString()

const endpointsFrom = (
  details: Extract<instanceDetailsOrError, { kind: 'instancerInstanceDetails' }>
): InstanceHistoryEndpoint[] =>
  (details.endpoints ?? []).map(({ kind, host, port }) => ({
    kind,
    host,
    port,
  }))

const sameEndpoints = (
  a: readonly InstanceHistoryEndpoint[],
  b: readonly InstanceHistoryEndpoint[]
) =>
  a.length === b.length &&
  a.every(
    (endpoint, i) =>
      endpoint.host === b[i]!.host && endpoint.port === b[i]!.port
  )

const isLive = (status: InstanceStatus) =>
  status === InstanceStatus.RUNNING || status === InstanceStatus.STARTING

// History is a side record: a failure is logged, never passed on to the
// instance call.
const guarded = async (
  context: InstanceHistoryContext,
  key: InstanceKey,
  run: () => Promise<unknown>
) => {
  try {
    await run()
  } catch (err) {
    context.log.error({ err, ...key }, 'instance history update failed')
  }
}

// A start that the instancer accepted. Starting while the instance is still
// running returns that same instance, so no new entry is made; an earlier
// entry whose instance has since ended is closed first.
export const recordInstanceStart = (
  db: DatabaseClient,
  context: InstanceHistoryContext,
  key: InstanceKey,
  details: instanceDetailsOrError
) =>
  guarded(context, key, async () => {
    if (
      details.kind !== 'instancerInstanceDetails' ||
      !isLive(details.status)
    ) {
      return
    }
    const now = Date.now()
    const endpoints = endpointsFrom(details)
    const expiresAt = expiresAtFrom(details.timeLeftMilliseconds, now)

    const open = await findOpenEntry(db, key)
    if (open) {
      if (!hasExpired(open, now) && sameEndpoints(open.endpoints, endpoints)) {
        await db
          .update(instanceHistory)
          .set({ expiresAt })
          .where(eq(instanceHistory.id, open.id))
        return
      }
      // different hostnames mean the instancer started a new one
      await closeEnded(db, open, now, InstanceEndReason.GONE)
    }

    await db.insert(instanceHistory).values({
      id: crypto.randomUUID(),
      teamId: key.teamId,
      challengeId: key.challengeId,
      playerId: context.playerId,
      ip: context.ip,
      endpoints,
      startedAt: new Date(now).toISOString(),
      expiresAt,
    })
  })

// The instance was stopped: by the team, or automatically after a solve.
export const recordInstanceStop = (
  db: DatabaseClient,
  context: InstanceHistoryContext,
  key: InstanceKey,
  details: instanceDetailsOrError,
  reason:
    | InstanceEndReason.STOPPED
    | InstanceEndReason.SOLVED = InstanceEndReason.STOPPED
) =>
  guarded(context, key, async () => {
    if (details.kind !== 'instancerInstanceDetails') return
    const open = await findOpenEntry(db, key)
    if (!open) return
    const now = Date.now()
    await (hasExpired(open, now)
      ? closeEntry(db, open, InstanceEndReason.EXPIRED, open.expiresAt!)
      : closeEntry(db, open, reason, new Date(now).toISOString()))
  })

// The team extended its instance: it now ends later.
export const recordInstanceExtend = (
  db: DatabaseClient,
  context: InstanceHistoryContext,
  key: InstanceKey,
  details: instanceDetailsOrError
) =>
  guarded(context, key, async () => {
    if (
      details.kind !== 'instancerInstanceDetails' ||
      !isLive(details.status)
    ) {
      return
    }
    const open = await findOpenEntry(db, key)
    if (!open) return
    const now = Date.now()
    await db
      .update(instanceHistory)
      .set({
        expiresAt: expiresAtFrom(details.timeLeftMilliseconds, now),
        extendCount: open.extendCount + 1,
      })
      .where(eq(instanceHistory.id, open.id))
  })

// A status check: closes the entry of an instance that has gone away.
export const recordInstanceStatus = (
  db: DatabaseClient,
  context: InstanceHistoryContext,
  key: InstanceKey,
  details: instanceDetailsOrError
) =>
  guarded(context, key, async () => {
    if (details.kind !== 'instancerInstanceDetails') return
    const ended =
      details.status === InstanceStatus.STOPPED
        ? InstanceEndReason.GONE
        : details.status === InstanceStatus.ERRORED
          ? InstanceEndReason.ERRORED
          : null
    if (!ended) return
    const open = await findOpenEntry(db, key)
    if (!open) return
    await closeEnded(db, open, Date.now(), ended)
  })

export type AdminInstancesQuery = RouteQuery<
  typeof FilterAdminInstancesRouteV2
> &
  Partial<RouteBody<typeof FilterAdminInstancesRouteV2>>

// an entry left open past its expiry ran out of time, even if nobody
// checked on it since
const expiredExpr = sql`(${instanceHistory.endedAt} IS NULL AND ${instanceHistory.expiresAt} <= now())`

const statusExpr = sql<InstanceHistoryStatus>`CASE
  WHEN ${instanceHistory.endedAt} IS NOT NULL THEN ${instanceHistory.endReason}
  WHEN ${expiredExpr} THEN ${InstanceHistoryStatus.EXPIRED}
  ELSE ${InstanceHistoryStatus.RUNNING}
END`

const endedAtExpr = sql<string | null>`CASE
  WHEN ${expiredExpr} THEN ${instanceHistory.expiresAt}
  ELSE ${instanceHistory.endedAt}
END`

const categoryExpr = sql<string>`${challenges.data} ->> 'category'`

const playerNameExpr = sql<
  string | null
>`coalesce(${players.displayName}, ${players.discordUsername})`

const likePattern = (value: string) => `%${value.trim().toLowerCase()}%`

const buildInstanceFilters = (
  params: AdminInstancesQuery & { id?: string }
) => {
  const search = params.search?.trim()
  return and(
    params.id ? eq(instanceHistory.id, params.id) : undefined,
    search
      ? sql`(
          lower(${users.name}::text) like ${likePattern(search)}
          or lower(coalesce(${playerNameExpr}, '')) like ${likePattern(search)}
          or lower(coalesce(${players.discordUsername}, '')) like ${likePattern(search)}
        )`
      : undefined,
    ...setFilter(sql`${instanceHistory.teamId}`, params.team),
    ...setFilter(sql`${instanceHistory.challengeId}`, params.challenge),
    ...setFilter(categoryExpr, params.category),
    ...setFilter(statusExpr, params.status)
  )
}

// One page of the instance history, newest first, with totals for the
// filters: instances, teams and instances per category.
export const getAdminInstances = async (
  db: DatabaseClient,
  params: AdminInstancesQuery & { id?: string }
) => {
  const filters = buildInstanceFilters(params)
  const joined = <T extends PgSelect>(query: T) =>
    query
      .innerJoin(users, eq(users.id, instanceHistory.teamId))
      .leftJoin(players, eq(players.id, instanceHistory.playerId))
      .leftJoin(challenges, eq(challenges.id, instanceHistory.challengeId))
      .where(filters)

  const [totals, categories, rows] = await Promise.all([
    joined(
      db
        .select({
          total: count(),
          teams: countDistinct(instanceHistory.teamId),
        })
        .from(instanceHistory)
        .$dynamic()
    ).then(takeUnique),
    joined(
      db
        .select({ category: categoryExpr, count: count() })
        .from(instanceHistory)
        .$dynamic()
    )
      .groupBy(categoryExpr)
      .orderBy(desc(count()), categoryExpr),
    joined(
      db
        .select({
          id: instanceHistory.id,
          teamId: users.id,
          teamName: users.name,
          teamAvatarUrl: users.avatarUrl,
          playerId: instanceHistory.playerId,
          playerName: playerNameExpr,
          playerUsername: players.discordUsername,
          challengeId: instanceHistory.challengeId,
          challengeName: sql<string | null>`${challenges.data} ->> 'name'`,
          challengeCategory: categoryExpr,
          status: statusExpr,
          startedAt: instanceHistory.startedAt,
          endedAt: endedAtExpr,
          expiresAt: instanceHistory.expiresAt,
          extendCount: instanceHistory.extendCount,
          ip: instanceHistory.ip,
          endpoints: instanceHistory.endpoints,
          requestCount: instanceHistory.requestCount,
          firstRequestAt: instanceHistory.firstRequestAt,
          lastRequestAt: instanceHistory.lastRequestAt,
        })
        .from(instanceHistory)
        .$dynamic()
    )
      .orderBy(desc(instanceHistory.startedAt), desc(instanceHistory.id))
      .limit(params.limit)
      .offset(params.offset),
  ])

  return {
    total: totals?.total ?? 0,
    teams: totals?.teams ?? 0,
    categories: categories.map(row => ({
      // a deleted challenge has no category left
      category: row.category ?? '',
      count: row.count,
    })),
    instances: rows.map(row => ({
      id: row.id,
      team: {
        id: row.teamId,
        name: row.teamName,
        avatarUrl: row.teamAvatarUrl,
      },
      player: row.playerId
        ? {
            id: row.playerId,
            name: row.playerName,
            username: row.playerUsername,
          }
        : null,
      challenge: {
        id: row.challengeId,
        name: row.challengeName ?? row.challengeId,
        category: row.challengeCategory ?? '',
      },
      status: row.status,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      expiresAt: row.expiresAt,
      extendCount: row.extendCount,
      ip: row.ip,
      endpoints: row.endpoints,
      requestCount: row.requestCount,
      firstRequestAt: row.firstRequestAt,
      lastRequestAt: row.lastRequestAt,
    })),
  }
}

// One history entry, in the same shape as the list.
export const getAdminInstance = async (db: DatabaseClient, id: string) => {
  const { instances } = await getAdminInstances(db, {
    id,
    limit: 1,
    offset: 0,
  })
  return instances[0]
}
