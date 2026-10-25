import { RecordChallengeDownloadRouteV2 } from '@rctf/types'
import { recordChallengeDownload } from '../../../../services/challenge-downloads'
import challsGroup from '../group'

challsGroup.route(
  RecordChallengeDownloadRouteV2,
  async ({ ctx, res, params, body, user }) => {
    const result = await recordChallengeDownload(ctx.var.db, {
      teamId: user.id,
      challengeId: params.id,
      url: body.url,
    })
    switch (result) {
      case 'recorded':
        return res.goodChallengeDownload()
      case 'unknownChallenge':
        return res.badChallenge()
      case 'unknownFile':
        return res.badBody({ reason: 'Not one of the challenge attachments' })
    }
  }
)
