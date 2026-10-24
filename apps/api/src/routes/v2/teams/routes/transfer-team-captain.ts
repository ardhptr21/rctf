import { TransferTeamCaptainRouteV2 } from '@rctf/types'
import { transferCaptain } from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf, respondTeamError } from '../util'

teamsGroup.route(TransferTeamCaptainRouteV2, async ({ ctx, res, body }) => {
  const result = await transferCaptain(
    ctx.var.db,
    ctx.var.redis,
    playerOf(ctx),
    body.playerId
  )
  if (!result.ok) {
    return respondTeamError(res, result.error)
  }
  return res.goodTeamCaptainTransfer()
})
