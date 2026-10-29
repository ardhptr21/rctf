import { ExportAdminTeamJoinCodesRouteV2 } from '@rctf/types'
import {
  getTeamJoinCodes,
  MAX_JOIN_CODE_EXPORT,
} from '../../../../services/users'
import adminGroup from '../group'

adminGroup.route(
  ExportAdminTeamJoinCodesRouteV2,
  async ({ ctx, res, query, body }) => {
    const found = await getTeamJoinCodes(ctx.var.db, { ...query, ...body })
    if (found.tooMany) {
      return res.badExportTooLarge({
        total: found.total,
        max: MAX_JOIN_CODE_EXPORT,
      })
    }
    return res.goodAdminTeamJoinCodes({ teams: found.teams })
  }
)
