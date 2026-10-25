import { challenges, scoreEvents, solves, users } from '@rctf/db'
import { ADMIN_PERMISSIONS, ChallengeScoringKind } from '@rctf/types'
import { and, eq, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

export const userIsNotBanned = eq(users.banned, false)
export const nonBannedUserJoin = (ownerId: PgColumn) =>
  and(eq(users.id, ownerId), userIsNotBanned)

// Teams that count toward scoring: not banned and without admin
// permissions. Admin teams can still solve challenges (to test them), but
// their solves never count toward points, solve counts, bloods, ranks or
// any public standings.
export const userIsAdminSql = sql<boolean>`(${users.perms} & ${ADMIN_PERMISSIONS}) <> 0`
export const userIsScored = and(
  userIsNotBanned,
  sql`(${users.perms} & ${ADMIN_PERMISSIONS}) = 0`
)!
export const scoredUserJoin = (ownerId: PgColumn) =>
  and(eq(users.id, ownerId), userIsScored)
// true for teams left out of scoring, for code that filters in memory
export const userIsUnscoredSql = sql<boolean>`(${users.banned} OR ${userIsAdminSql})`

export const challengeIsPublicSql = and(
  sql`COALESCE((${challenges.data} ->> 'hidden')::boolean, false) = false`,
  sql`COALESCE((${challenges.data} ->> 'releaseTime')::bigint, 0) <= ${sql.raw('extract(epoch from now())::bigint * 1000')}`
)!

export const scoringKindOf = (data: {
  scoring?: { kind: ChallengeScoringKind } | null
}): ChallengeScoringKind => data.scoring?.kind ?? ChallengeScoringKind.DECAY

export const isDecayKind = sql`COALESCE(${challenges.data} -> 'scoring' ->> 'kind', ${ChallengeScoringKind.DECAY}) = ${ChallengeScoringKind.DECAY}`

// A feed solve's points as of `cutoff` (an ISO timestamp, or a placeholder
// for one): the sum of its feed score events up to then. While the
// scoreboard is frozen this stands in for solves.points, which keeps
// following the live feed.
export const feedPointsAtSql = (cutoff: string | SQL) => sql<number>`COALESCE((
  SELECT SUM(${scoreEvents.pointsDelta})
  FROM ${scoreEvents}
  WHERE ${scoreEvents.challengeid} = ${solves.challengeid}
    AND ${scoreEvents.userid} = ${solves.userid}
    AND ${scoreEvents.source} = 'feed'
    AND ${scoreEvents.eventAt} <= ${cutoff}::timestamptz
), 0)::int`
