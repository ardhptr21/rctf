import { SubmitFlagRoute } from '@rctf/types'
import { submitFlag } from '../../../../services/challenges'
import { getResolvedSettings } from '../../../../services/settings'
import challsGroup from '../group'

challsGroup.route(SubmitFlagRoute, async ({ res, ctx, params, body, user }) => {
  // the JSON route carries neither AI links nor a proof file; clients use
  // the v2 route when either is required
  const { requireAiLinks, requireSolverProof } = await getResolvedSettings(
    ctx.var.db,
    ctx.var.redis
  )
  if (requireSolverProof) {
    return res.badProofRequired()
  }
  if (requireAiLinks) {
    return res.badAiLinks()
  }

  return await submitFlag(res, ctx.var.db, ctx.var.redis, ctx.var.logger, {
    userId: user.id,
    playerId: ctx.var.player?.id,
    challengeId: params.id,
    flag: body.flag,
    submissionIp: ctx.var.ip,
  })
})
