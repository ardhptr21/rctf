import type { DatabaseClient, SubmissionDetails } from '@rctf/db'
import { challenges, players, submissions, users } from '@rctf/db'
import type {
  FilterAdminSubmissionsRouteV2,
  GetAdminSubmissionsRouteV2,
  RouteBody,
  RouteQuery,
  SubmissionKind,
  SubmissionResult,
} from '@rctf/types'
import {
  SubmissionSortBy,
  SubmissionSortOrder,
  SubmissionTeamStatus,
} from '@rctf/types'
import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { alias, type PgColumn } from 'drizzle-orm/pg-core'
import { setFilter } from '../lib/db-filters'

export const createSubmission = async (
  db: DatabaseClient,
  params: {
    kind: SubmissionKind
    challengeId: string
    userId: string
    // the signed-in player, when the request came from one
    playerId?: string | undefined
    ip: string | undefined
    result: SubmissionResult
    details?: SubmissionDetails
    relatedId?: string | null
  }
): Promise<void> => {
  await db.insert(submissions).values({
    id: crypto.randomUUID(),
    kind: params.kind,
    challengeId: params.challengeId,
    userId: params.userId,
    playerId: params.playerId ?? null,
    ip: params.ip ?? 'unknown',
    result: params.result,
    details: params.details ?? {},
    relatedId: params.relatedId ?? null,
    createdAt: new Date().toISOString(),
  })
}

type AdminSubmissionsQuery = RouteQuery<typeof GetAdminSubmissionsRouteV2> &
  Partial<RouteBody<typeof FilterAdminSubmissionsRouteV2>>

// the filters and sort, without paging; shared by the list and the export
export type AdminSubmissionsFilters = Omit<
  AdminSubmissionsQuery,
  'limit' | 'offset'
>

const challengeCategoryExpr = sql<string>`${challenges.data} ->> 'category'`
const teamBannedExpr = sql<boolean>`coalesce(${users.banned}, false)`
const cheatedFromIdExpr = sql<
  string | null
>`${submissions.details} ->> 'cheatedFrom'`

const likePattern = (value: string) => `%${value.trim().toLowerCase()}%`

// a deleted player keeps their id on old submissions but has no name
const playerNameExpr = sql<
  string | null
>`coalesce(${players.displayName}, ${players.discordUsername})`

const buildSubmissionsFilters = (
  params: AdminSubmissionsFilters
): SQL | undefined => {
  const challengeSearch = params.challengeSearch?.trim()
  const teamSearch = params.teamSearch?.trim()

  return and(
    challengeSearch
      ? sql`(
          lower(${challenges.data} ->> 'name') like ${likePattern(challengeSearch)}
          or lower(${challengeCategoryExpr}) like ${likePattern(challengeSearch)}
        )`
      : undefined,
    // matches the team or the player who submitted
    teamSearch
      ? sql`(
          lower(${users.name}::text) like ${likePattern(teamSearch)}
          or lower(coalesce(${playerNameExpr}, '')) like ${likePattern(teamSearch)}
          or lower(coalesce(${players.discordUsername}, '')) like ${likePattern(teamSearch)}
        )`
      : undefined,
    ...setFilter(sql`${submissions.challengeId}`, params.challenge),
    ...setFilter(sql`${submissions.userId}`, params.team),
    ...setFilter(sql`${submissions.kind}`, params.kind),
    ...setFilter(sql`${submissions.result}`, params.result),
    ...setFilter(teamBannedExpr, {
      include: params.teamStatus?.include?.map(isBannedStatus),
      exclude: params.teamStatus?.exclude?.map(isBannedStatus),
    }),
    ...setFilter(challengeCategoryExpr, params.category),
    ...setFilter(sql`${users.division}`, params.division),
    params.createdAfter
      ? gte(submissions.createdAt, params.createdAfter)
      : undefined,
    params.createdBefore
      ? lte(submissions.createdAt, params.createdBefore)
      : undefined
  )
}

const buildSubmissionsOrderBy = (params: AdminSubmissionsFilters): SQL[] => {
  const sortBy = params.sortBy ?? SubmissionSortBy.CREATED_AT
  const dir = params.sortOrder === SubmissionSortOrder.ASC ? asc : desc

  const sortExpr: Record<SubmissionSortBy, SQL | PgColumn> = {
    [SubmissionSortBy.CHALLENGE]: sql`lower(${challenges.data} ->> 'name')`,
    [SubmissionSortBy.TEAM]: sql`lower(${users.name}::text)`,
    [SubmissionSortBy.IP]: submissions.ip,
    [SubmissionSortBy.KIND]: submissions.kind,
    [SubmissionSortBy.RESULT]: submissions.result,
    [SubmissionSortBy.CREATED_AT]: submissions.createdAt,
  }

  const tieDir = sortBy === SubmissionSortBy.CREATED_AT ? dir : desc
  return [
    dir(sortExpr[sortBy]),
    tieDir(submissions.createdAt),
    tieDir(submissions.id),
  ]
}

export type AdminSubmissionInfo = {
  id: string
  kind: SubmissionKind
  challengeId: string
  challengeName: string
  challengeCategory: string
  userId: string
  userName: string
  userDivision: string
  userAvatarUrl: string | null
  userCountryCode: string | null
  userStatusText: string | null
  userBanned: boolean
  playerId: string | null
  playerName: string | null
  playerUsername: string | null
  playerAvatarUrl: string | null
  ip: string
  result: SubmissionResult
  cheatedFromId: string | null
  cheatedFromName: string | null
  details: SubmissionDetails
  relatedId: string | null
  createdAt: string
}

const cheatedFromUsers = alias(users, 'cheated_from_users')

// Every matching submission with its challenge, team, player and the team a
// cheated flag belonged to, unsorted and unpaged.
const submissionsQuery = (
  db: DatabaseClient,
  params: AdminSubmissionsFilters
) =>
  db
    .select({
      id: submissions.id,
      kind: submissions.kind,
      challengeId: submissions.challengeId,
      challengeName: sql<string>`coalesce(${challenges.data} ->> 'name', ${submissions.challengeId})`,
      challengeCategory: sql<string>`coalesce(${challenges.data} ->> 'category', 'deleted')`,
      userId: submissions.userId,
      userName: sql<string>`coalesce(${users.name}::text, ${submissions.userId})`,
      userDivision: sql<string>`coalesce(${users.division}, 'unknown')`,
      userAvatarUrl: users.avatarUrl,
      userCountryCode: users.countryCode,
      userStatusText: users.statusText,
      userBanned: teamBannedExpr,
      playerId: submissions.playerId,
      playerName: playerNameExpr,
      playerUsername: players.discordUsername,
      playerAvatarUrl: players.avatarUrl,
      ip: submissions.ip,
      result: submissions.result,
      cheatedFromId: cheatedFromIdExpr,
      cheatedFromName: sql<string | null>`${cheatedFromUsers.name}::text`,
      details: submissions.details,
      relatedId: submissions.relatedId,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .leftJoin(challenges, eq(challenges.id, submissions.challengeId))
    .leftJoin(users, eq(users.id, submissions.userId))
    .leftJoin(players, eq(players.id, submissions.playerId))
    .leftJoin(cheatedFromUsers, eq(cheatedFromUsers.id, cheatedFromIdExpr))
    .where(buildSubmissionsFilters(params))
    .$dynamic()

export const getSubmissions = async (
  db: DatabaseClient,
  params: AdminSubmissionsQuery
): Promise<{ total: number; submissions: AdminSubmissionInfo[] }> => {
  const baseQuery = submissionsQuery(db, params)
  const [countResult, rows] = await Promise.all([
    db.select({ count: count() }).from(baseQuery.as('s')),
    baseQuery
      .orderBy(...buildSubmissionsOrderBy(params))
      .limit(params.limit)
      .offset(params.offset),
  ])

  return { total: countResult[0]?.count ?? 0, submissions: rows }
}

export const MAX_EXPORT_ROWS = 50_000

export type SubmissionsExportRows =
  | { tooMany: false; submissions: AdminSubmissionInfo[] }
  | { tooMany: true; total: number }

// Every submission matching the filters, in the chosen sort, for an export.
// More than `maxRows` is refused rather than cut off silently.
export const getSubmissionsForExport = async (
  db: DatabaseClient,
  params: AdminSubmissionsFilters,
  maxRows = MAX_EXPORT_ROWS
): Promise<SubmissionsExportRows> => {
  const baseQuery = submissionsQuery(db, params)
  // one extra row tells an export at the limit from one over it
  const rows = await baseQuery
    .orderBy(...buildSubmissionsOrderBy(params))
    .limit(maxRows + 1)
  if (rows.length <= maxRows) {
    return { tooMany: false, submissions: rows }
  }
  const total = await db
    .select({ count: count() })
    .from(submissionsQuery(db, params).as('s'))
  return { tooMany: true, total: total[0]?.count ?? rows.length }
}

function isBannedStatus(status: SubmissionTeamStatus) {
  return status === SubmissionTeamStatus.BANNED
}
