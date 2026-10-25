import { z } from 'zod/mini'
import { AccessControlledPage, Permissions } from '../../enums'
import { defineRoute } from '../../internal'
import {
  BadAiLinks,
  BadAlreadySolvedChallenge,
  BadBody,
  BadChallenge,
  BadEnded,
  BadFlag,
  BadNotStarted,
  BadProofFileSize,
  BadProofRequired,
  BadTeamBanned,
  BadRateLimit,
  BadReplayedRequest,
  BadSignature,
  BadUnknownUser,
  GoodChallengeScoresV2,
  GoodFlag,
  GoodChallengeSolvesV2,
  GoodChallengesV2,
  GoodDynamicScores,
  BadPerms,
  BadToken,
  BadNoTeam,
} from '../../responses'
import { DynamicScoresPayloadSchema } from '../../util/schemas'
import { AiLinksSchema } from '../../util/submission-evidence'
import { FileFieldSchema } from '../../util/types'

export const GetChallengesRouteV2 = defineRoute({
  path: '/v2/challs',
  method: 'GET',
  goodResponses: [GoodChallengesV2],
  badResponses: [BadNotStarted, BadPerms, BadToken, BadNoTeam],
  authRequired: false,
  optionalAuth: true,
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
  pageAccess: AccessControlledPage.Challenges,
})

// intentionally has neither onlyWhenStarted nor onlyWhenNotFinished: a
// dynamic scoring backend must be able to seed scores before the event
// starts, and the leaderboard worker will drain any post-end deliveries into
// the final tally too
export const SubmitDynamicScoresRouteV2 = defineRoute({
  path: '/v2/challs/:id/scores',
  method: 'POST',
  goodResponses: [GoodDynamicScores],
  badResponses: [BadSignature, BadBody, BadReplayedRequest],
  authRequired: false,
  serviceAuth: 'dynamicChallenge',
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  body: DynamicScoresPayloadSchema,
})

export const GetChallengeSolvesRouteV2 = defineRoute({
  path: '/v2/challs/:id/solves',
  method: 'GET',
  goodResponses: [GoodChallengeSolvesV2],
  badResponses: [
    BadNotStarted,
    BadChallenge,
    BadBody,
    BadPerms,
    BadToken,
    BadNoTeam,
  ],
  optionalAuth: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  query: z.object({
    // NOTE: Has max limits that are loaded from config
    limit: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(1))
      .check(z.describe('Integer `>= 1`. Maximum enforced by config.')),
    offset: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(0))
      .check(z.describe('Integer `>= 0`.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
  pageAccess: AccessControlledPage.Challenges,
})

export const GetChallengeScoresRouteV2 = defineRoute({
  path: '/v2/challs/:id/scores',
  method: 'GET',
  goodResponses: [GoodChallengeScoresV2],
  badResponses: [
    BadNotStarted,
    BadChallenge,
    BadBody,
    BadPerms,
    BadToken,
    BadNoTeam,
  ],
  optionalAuth: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  query: z.object({
    // NOTE: Has max limits that are loaded from config
    limit: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(1))
      .check(z.describe('Integer `>= 1`. Maximum enforced by config.')),
    offset: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(0))
      .check(z.describe('Integer `>= 0`.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
  pageAccess: AccessControlledPage.Challenges,
})

export const SubmitFlagRouteV2 = defineRoute({
  path: '/v2/challs/:id/submit',
  method: 'POST',
  bodyFormat: 'form-data',
  body: z.object({
    flag: z
      .string()
      .check(z.maxLength(1024))
      .check(z.describe('Maximum length `1024`.')),
    aiLinks: z.optional(AiLinksSchema),
    proof: z.optional(
      FileFieldSchema.check(
        z.describe(
          'One solver proof file of any type: a solve script or a screenshot of the flag.'
        )
      )
    ),
  }),
  goodResponses: [GoodFlag],
  badResponses: [
    BadFlag,
    BadAiLinks,
    BadProofRequired,
    BadProofFileSize,
    BadPerms,
    BadTeamBanned,
    BadNotStarted,
    BadEnded,
    BadChallenge,
    BadRateLimit,
    BadAlreadySolvedChallenge,
    BadUnknownUser,
    BadToken,
  ],
  authRequired: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsWrite,
  onlyWhenNotFinished: true,
})
