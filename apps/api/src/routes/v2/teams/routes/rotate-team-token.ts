import { RotateTeamTokenRouteV2 } from '@rctf/types'
import { rotateJoinToken } from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf } from '../util'

teamsGroup.route(RotateTeamTokenRouteV2, async ({ ctx, res }) => {
  const player = playerOf(ctx)
  if (!player.teamId) {
    return res.badNoTeam()
  }
  if (!player.isCaptain) {
    return res.badNotCaptain()
  }
  return res.goodTeamTokenRotate({
    joinToken: await rotateJoinToken(ctx.var.db, player.teamId),
  })
})
