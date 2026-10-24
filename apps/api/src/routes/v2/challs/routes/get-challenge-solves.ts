import { GetChallengeSolvesRouteV2 } from '@rctf/types'
import { getChallengeSolvesResponse } from '../../../../services/challenge-solves'
import { getFreezeCutoffForViewer } from '../../../../services/settings'
import challsGroup from '../group'

challsGroup.route(
  GetChallengeSolvesRouteV2,
  async ({ res, ctx, params, query, user }) =>
    getChallengeSolvesResponse({
      res,
      db: ctx.var.db,
      challengeId: params.id,
      userId: user?.id ?? null,
      limit: query.limit,
      offset: query.offset,
      solveCutoff: await getFreezeCutoffForViewer(
        ctx.var.db,
        ctx.var.redis,
        user
      ),
    })
)
