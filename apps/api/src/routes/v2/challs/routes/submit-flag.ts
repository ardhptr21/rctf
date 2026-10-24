import { config } from '@rctf/config'
import { SubmitFlagRouteV2 } from '@rctf/types'
import { submitFlag } from '../../../../services/challenges'
import { getResolvedSettings } from '../../../../services/settings'
import challsGroup from '../group'

challsGroup.route(
  SubmitFlagRouteV2,
  async ({ res, ctx, params, body, user }) => {
    const { requireSubmissionEvidence } = await getResolvedSettings(
      ctx.var.db,
      ctx.var.redis
    )

    if (body.proof && body.proof.size > config.maxProofSize) {
      return res.badProofFileSize({ maxSize: config.maxProofSize })
    }
    if (requireSubmissionEvidence) {
      if (!body.aiLinks || body.aiLinks.length === 0) {
        return res.badAiLinks()
      }
      if (!body.proof || body.proof.size === 0) {
        return res.badProofRequired()
      }
    }

    return await submitFlag(res, ctx.var.db, ctx.var.redis, ctx.var.logger, {
      userId: user.id,
      challengeId: params.id,
      flag: body.flag,
      submissionIp: ctx.var.ip,
      evidence:
        body.aiLinks || body.proof
          ? { aiLinks: body.aiLinks ?? [], proofFile: body.proof }
          : undefined,
    })
  }
)
