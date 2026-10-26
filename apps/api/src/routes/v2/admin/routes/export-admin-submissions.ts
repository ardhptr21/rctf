import { challenges, users, type DatabaseClient } from '@rctf/db'
import { ExportAdminSubmissionsRouteV2 } from '@rctf/types'
import { inArray, sql } from 'drizzle-orm'
import { getResolvedSettings } from '../../../../services/settings'
import {
  getSubmissionsForExport,
  MAX_EXPORT_ROWS,
  type AdminSubmissionsFilters,
} from '../../../../services/submissions'
import {
  buildSubmissionsWorkbook,
  describeFilters,
  describeSort,
  exportFileName,
} from '../../../../services/submissions-export'
import adminGroup from '../group'

const filterIds = (
  filter:
    | { include?: string[] | null; exclude?: string[] | null }
    | null
    | undefined
) => [...(filter?.include ?? []), ...(filter?.exclude ?? [])]

// names for the challenges and teams the filters mention, for the summary
const filterNames = async (
  db: DatabaseClient,
  params: AdminSubmissionsFilters
) => {
  const challengeIds = filterIds(params.challenge)
  const teamIds = filterIds(params.team)
  const [challengeRows, teamRows] = await Promise.all([
    challengeIds.length === 0
      ? []
      : db
          .select({
            id: challenges.id,
            name: sql<string>`concat(${challenges.data} ->> 'category', '/', ${challenges.data} ->> 'name')`,
          })
          .from(challenges)
          .where(inArray(challenges.id, challengeIds)),
    teamIds.length === 0
      ? []
      : db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, teamIds)),
  ])
  return {
    challenges: new Map(challengeRows.map(row => [row.id, row.name])),
    teams: new Map(teamRows.map(row => [row.id, row.name])),
  }
}

adminGroup.route(
  ExportAdminSubmissionsRouteV2,
  async ({ ctx, res, query, body }) => {
    const params: AdminSubmissionsFilters = { ...query, ...body }
    const found = await getSubmissionsForExport(ctx.var.db, params)
    if (found.tooMany) {
      return res.badExportTooLarge({
        total: found.total,
        max: MAX_EXPORT_ROWS,
      })
    }

    const generatedAt = new Date()
    const [{ ctfName }, names] = await Promise.all([
      getResolvedSettings(ctx.var.db, ctx.var.redis),
      filterNames(ctx.var.db, params),
    ])
    const file = await buildSubmissionsWorkbook(found.submissions, {
      ctfName,
      generatedAt,
      filters: describeFilters(params, names),
      sort: describeSort(params),
    })
    return res.goodAdminSubmissionsExport({
      fileName: exportFileName(ctfName, generatedAt),
      data: file.toString('base64'),
    })
  }
)
