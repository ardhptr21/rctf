import { config } from '@rctf/config'
import { GetAdminLiveLeaderboardRouteV2 } from '@rctf/types'
import { getLiveLeaderboardWithTotal } from '../../../../services/leaderboard-queries'
import adminGroup from '../group'

adminGroup.route(
  GetAdminLiveLeaderboardRouteV2,
  async ({ ctx, res, query: { limit, offset, division } }) => {
    if (
      limit > config.leaderboard.maxLimit ||
      offset > config.leaderboard.maxOffset
    ) {
      return res.badBody({
        reason: 'Invalid limit or offset',
      })
    }

    if (division && !Object.hasOwn(config.divisions, division)) {
      return res.badBody({
        reason: 'Invalid division',
      })
    }

    return res.goodLeaderboardV2(
      await getLiveLeaderboardWithTotal(
        ctx.var.db,
        ctx.var.redis,
        limit,
        offset,
        division
      )
    )
  }
)
