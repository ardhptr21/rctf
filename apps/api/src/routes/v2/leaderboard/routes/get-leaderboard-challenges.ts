import { challenges } from '@rctf/db'
import { ADMIN_PERMISSIONS, GetLeaderboardChallengesRouteV2 } from '@rctf/types'
import { sql } from 'drizzle-orm'
import { preparedPerDb } from '../../../../lib/prepared'
import {
  challengeIsPublicSql,
  scoringKindOf,
} from '../../../../services/challenge-queries'
import {
  getResolvedSettings,
  getScoreboardFreezeCutoff,
} from '../../../../services/settings'
import leaderboardGroup from '../group'

const preparedLeaderboardChallenges = preparedPerDb(db =>
  db
    .select({
      id: challenges.id,
      data: challenges.data,
      score: challenges.score,
      solveCount: challenges.solveCount,
      firstBloodIds: sql<string[]>`
        COALESCE((
          SELECT ARRAY_AGG(first_blood.userid ORDER BY first_blood.createdat ASC, first_blood.id ASC)
          FROM (
            SELECT solves.userid, solves.createdat, solves.id
            FROM solves
            INNER JOIN "users" ON "users".id = solves.userid
            WHERE solves.challengeid = challenges.id
              AND solves.source = 'flag'
              AND "users".banned = false
              AND ("users".perms & ${ADMIN_PERMISSIONS}) = 0
              AND solves.createdat <= COALESCE(${sql.placeholder('solveCutoff')}::timestamptz, 'infinity'::timestamptz)
            ORDER BY solves.createdat ASC, solves.id ASC
            LIMIT 3
          ) AS first_blood
        ), ARRAY[]::text[])
      `.as('first_blood_ids'),
    })
    .from(challenges)
    .where(challengeIsPublicSql)
    .prepare('rctf_leaderboard_challenges')
)

leaderboardGroup.route(
  GetLeaderboardChallengesRouteV2,
  async ({ ctx, res }) => {
    // bloods after the freeze would reveal post-freeze solves
    const solveCutoff = getScoreboardFreezeCutoff(
      await getResolvedSettings(ctx.var.db, ctx.var.redis)
    )
    const rows = await preparedLeaderboardChallenges(ctx.var.db).execute({
      solveCutoff:
        solveCutoff === null ? null : new Date(solveCutoff).toISOString(),
    })

    return res.goodLeaderboardChallengesV2({
      challenges: Object.fromEntries(
        rows.map(row => {
          const scoringKind = scoringKindOf(row.data)
          return [
            row.id,
            {
              name: row.data.name ?? '',
              category: row.data.category ?? '',
              points: row.score ?? 0,
              solves: row.solveCount ?? 0,
              sortWeight: row.data.sortWeight ?? null,
              scoringKind,
              firstSolvers: (row.firstBloodIds ?? []).map(id => ({ id })),
            },
          ]
        })
      ),
    })
  }
)
