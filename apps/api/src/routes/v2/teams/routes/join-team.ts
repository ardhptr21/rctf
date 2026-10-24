import { JoinTeamRouteV2 } from '@rctf/types'
import { joinTeam } from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf, respondTeamError } from '../util'

teamsGroup.route(JoinTeamRouteV2, async ({ ctx, res, body }) => {
  const result = await joinTeam(
    ctx.var.db,
    ctx.var.redis,
    playerOf(ctx),
    body.token.trim()
  )
  if (!result.ok) {
    return respondTeamError(res, result.error)
  }
  return res.goodTeamJoin(result.value)
})
