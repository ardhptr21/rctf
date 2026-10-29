import { ImportAdminTeamsRouteV2 } from '@rctf/types'
import { checkTeamImport, importTeams } from '../../../../services/team-import'
import adminGroup from '../group'

adminGroup.route(ImportAdminTeamsRouteV2, async ({ ctx, res, body }) => {
  if (!body.confirm) {
    return res.goodAdminTeamsImportPreview(
      await checkTeamImport(ctx.var.db, body.csv)
    )
  }
  const result = await importTeams(ctx.var.db, body.csv)
  if (!result.ok) {
    return res.badTeamsImport({ problems: result.problems })
  }
  return res.goodAdminTeamsImport({ teams: result.teams })
})
