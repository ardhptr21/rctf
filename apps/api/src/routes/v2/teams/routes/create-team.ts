import { CreateTeamRouteV2 } from '@rctf/types'
import { createTeam } from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf, respondTeamError } from '../util'

teamsGroup.route(CreateTeamRouteV2, async ({ ctx, res, body }) => {
  const result = await createTeam(ctx.var.db, ctx.var.redis, playerOf(ctx), {
    name: body.name,
    division: body.division,
  })
  if (!result.ok) {
    return respondTeamError(res, result.error)
  }
  return res.goodTeamCreate(result.value)
})
