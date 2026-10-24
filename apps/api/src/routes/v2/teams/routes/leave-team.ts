import { LeaveTeamRouteV2 } from '@rctf/types'
import { leaveTeam } from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf, respondTeamError } from '../util'

teamsGroup.route(LeaveTeamRouteV2, async ({ ctx, res }) => {
  const result = await leaveTeam(ctx.var.db, ctx.var.redis, playerOf(ctx))
  if (!result.ok) {
    return respondTeamError(res, result.error)
  }
  return res.goodTeamLeave()
})
