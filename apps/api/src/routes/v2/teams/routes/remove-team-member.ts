import { RemoveTeamMemberRouteV2 } from '@rctf/types'
import { removeTeamMember } from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf, respondTeamError } from '../util'

teamsGroup.route(RemoveTeamMemberRouteV2, async ({ ctx, res, params }) => {
  const result = await removeTeamMember(
    ctx.var.db,
    ctx.var.redis,
    playerOf(ctx),
    params.playerId
  )
  if (!result.ok) {
    return respondTeamError(res, result.error)
  }
  return res.goodTeamMemberRemove()
})
