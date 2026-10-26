import { ALL_REGIONS } from '@rctf/util'
import { z } from 'zod/mini'
import { PageAccess } from '../../enums/page-access'
import { Permissions } from '../../enums/permissions'
import { defineRoute } from '../../internal'
import {
  BadAdminBotConfig,
  BadAvatarFile,
  BadAvatarFileSize,
  BadBody,
  BadChallenge,
  BadEndpoint,
  BadExportTooLarge,
  BadExternalAuthRequest,
  BadInstancerConfig,
  BadInstancerError,
  BadKnownEmail,
  BadKnownName,
  BadModerationNotPassed,
  BadName,
  BadPerms,
  BadRateLimit,
  BadToken,
  BadUnknownSolveV2,
  BadUnknownUser,
  BadUnknownVerification,
  BadUserPrivileged,
  ErrorInternal,
  GoodAdminBotChallengeSource,
  GoodAdminBotJobPull,
  GoodAdminBotJobUpdate,
  GoodAdminBotQueueDepth,
  GoodAdminBotStatus,
  GoodAdminChallengesV2,
  GoodAdminChallengeV2,
  GoodChallengeSolvesV2,
  GoodAdminExternalAuthClientCreate,
  GoodAdminExternalAuthClientDelete,
  GoodAdminExternalAuthClients,
  GoodAdminSettings,
  GoodAdminSettingsUpdate,
  GoodAdminSubmissions,
  GoodAdminSubmissionsExport,
  GoodAdminUserDeleteV2,
  GoodAdminUsersV2,
  GoodAdminUserUpdateV2,
  GoodAdminUserV2,
  GoodAdminUserVerificationCompleteV2,
  GoodAdminUserVerificationResendV2,
  GoodAdminUserVerificationsV2,
  GoodAllChallengeSolvesDeleteV2,
  GoodAvatarUpdated,
  GoodChallengeSolveDeleteV2,
  GoodChallengeUpdateV2,
  GoodFlagProviders,
  GoodCreateUserTokenV2,
  GoodFilesUploadV2,
  GoodInstancerActionResult,
  GoodInstancerSchema,
  GoodInstanceStatus,
  GoodLeaderboardV2,
  GoodSubmissionProof,
  BadNoProof,
  BadUnknownSubmission,
  GoodUploadsQueryV2,
} from '../../responses'
import {
  AdminTeamSortBy,
  AdminTeamStatus,
  AiLinkPatternsSchema,
  ChallengeFileSchemaV2,
  ChallengePointsSchema,
  ChallengeScoringSchema,
  FileFieldSchema,
  FlagEntrySchema,
  HttpUrl,
  IntegritySettingsSchema,
  MultipleFileFieldSchema,
  PartialInstancerConfigSchema,
  searchFilter,
  SortOrder,
  SponsorUpdateSchemaV2,
  SubmissionKind,
  SubmissionResult,
  SubmissionSortBy,
  SubmissionSortOrder,
  SubmissionTeamStatus,
  UploadFileName,
  UploadSha256,
  UserName,
} from '../../util'
import { example } from '../../util/example'

export const GetAdminChallengesRouteV2 = defineRoute({
  path: '/v2/admin/challs',
  method: 'GET',
  goodResponses: [GoodAdminChallengesV2],
  badResponses: [BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.challsRead,
})

const AdminUsersQuery = z.object({
  limit: z
    .pipe(z.coerce.number(), z.int())
    .check(z.gte(1))
    .check(z.lte(100))
    .check(z.describe('Integer `1`-`100`. Page size.')),
  offset: z
    .pipe(z.coerce.number(), z.int())
    .check(z.gte(0))
    .check(z.describe('Integer `>= 0`. Page offset.')),
  search: example(
    z.optional(z.string().check(z.minLength(1)).check(z.maxLength(100))),
    'otter'
  ).check(z.describe('Free-text search over team name and email.')),
  sortBy: example(z.optional(z.enum(AdminTeamSortBy)), 'score').check(
    z.describe('Column to sort by.')
  ),
  sortOrder: example(z.optional(z.enum(SortOrder)), 'desc').check(
    z.describe('Sort direction.')
  ),
})

const AdminUsersFilterBody = z.object({
  status: z
    .nullish(searchFilter(z.enum(AdminTeamStatus)))
    .check(z.describe('Include/exclude filter on team status.')),
  division: z
    .nullish(searchFilter(z.string()))
    .check(z.describe('Include/exclude filter on division.')),
})

export const GetAdminUsersRouteV2 = defineRoute({
  path: '/v2/admin/users',
  method: 'GET',
  query: AdminUsersQuery,
  goodResponses: [GoodAdminUsersV2],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const FilterAdminUsersRouteV2 = defineRoute({
  path: '/v2/admin/users',
  method: 'POST',
  query: AdminUsersQuery,
  body: AdminUsersFilterBody,
  goodResponses: [GoodAdminUsersV2],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

const SubmissionDateString = z.pipe(
  z
    .string()
    .check(z.maxLength(64))
    .check(
      z.refine((value: string) => Number.isFinite(Date.parse(value)), {
        message: 'must be a valid date',
      })
    ),
  z.transform((value: string) => new Date(Date.parse(value)).toISOString())
)

const AdminSubmissionsQuery = z.object({
  limit: z
    .pipe(z.coerce.number(), z.int())
    .check(z.gte(1))
    .check(z.lte(100))
    .check(z.describe('Integer `1`-`100`. Page size.')),
  offset: z
    .pipe(z.coerce.number(), z.int())
    .check(z.gte(0))
    .check(z.describe('Integer `>= 0`. Page offset.')),
  sortBy: example(z.optional(z.enum(SubmissionSortBy)), 'createdAt').check(
    z.describe('Column to sort by.')
  ),
  sortOrder: example(z.optional(z.enum(SubmissionSortOrder)), 'desc').check(
    z.describe('Sort direction.')
  ),
  challengeSearch: example(
    z.optional(z.string().check(z.minLength(1)).check(z.maxLength(100))),
    'baby'
  ).check(z.describe('Free-text search over challenge name.')),
  teamSearch: example(
    z.optional(z.string().check(z.minLength(1)).check(z.maxLength(100))),
    'otter'
  ).check(
    z.describe(
      'Free-text search over team name and the Discord name of the submitting player.'
    )
  ),
})

const AdminSubmissionsFilterBody = z
  .object({
    challenge: z
      .nullish(searchFilter(z.string()))
      .check(z.describe('Include/exclude filter on challenge ID.')),
    team: z
      .nullish(searchFilter(z.string()))
      .check(z.describe('Include/exclude filter on team ID.')),
    kind: z
      .nullish(searchFilter(z.enum(SubmissionKind)))
      .check(z.describe('Include/exclude filter on submission kind.')),
    result: z
      .nullish(searchFilter(z.enum(SubmissionResult)))
      .check(z.describe('Include/exclude filter on result.')),
    teamStatus: z
      .nullish(searchFilter(z.enum(SubmissionTeamStatus)))
      .check(z.describe('Include/exclude filter on team ban status.')),
    category: z
      .nullish(searchFilter(z.string()))
      .check(z.describe('Include/exclude filter on category.')),
    division: z
      .nullish(searchFilter(z.string()))
      .check(z.describe('Include/exclude filter on division.')),
    createdAfter: example(
      z.optional(SubmissionDateString),
      '2024-03-09T00:00:00.000Z'
    ).check(z.describe('Only include submissions at or after this date.')),
    createdBefore: example(
      z.optional(SubmissionDateString),
      '2024-03-10T00:00:00.000Z'
    ).check(z.describe('Only include submissions at or before this date.')),
  })
  .check(
    z.superRefine((data, ctx) => {
      if (
        data.createdAfter &&
        data.createdBefore &&
        Date.parse(data.createdAfter) > Date.parse(data.createdBefore)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'must be before createdBefore',
          path: ['createdAfter'],
        })
      }
    })
  )

export const GetAdminSubmissionsRouteV2 = defineRoute({
  path: '/v2/admin/submissions',
  method: 'GET',
  query: AdminSubmissionsQuery,
  goodResponses: [GoodAdminSubmissions],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite | Permissions.challsRead,
})

export const GetAdminSubmissionProofRouteV2 = defineRoute({
  path: '/v2/admin/submissions/:id/proof',
  method: 'GET',
  params: z.object({
    id: z.string().check(z.describe('Submission log ID.')),
  }),
  goodResponses: [GoodSubmissionProof],
  badResponses: [BadUnknownSubmission, BadNoProof, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite | Permissions.challsRead,
})

export const FilterAdminSubmissionsRouteV2 = defineRoute({
  path: '/v2/admin/submissions',
  method: 'POST',
  query: AdminSubmissionsQuery,
  body: AdminSubmissionsFilterBody,
  goodResponses: [GoodAdminSubmissions],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite | Permissions.challsRead,
})

// The whole filtered list as an Excel file: the same filters and sort as the
// list, without paging.
export const ExportAdminSubmissionsRouteV2 = defineRoute({
  path: '/v2/admin/submissions/export',
  method: 'POST',
  query: z.omit(AdminSubmissionsQuery, { limit: true, offset: true }),
  body: AdminSubmissionsFilterBody,
  goodResponses: [GoodAdminSubmissionsExport],
  badResponses: [BadBody, BadExportTooLarge, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite | Permissions.challsRead,
})

const AdminUserParams = z.object({
  id: z.string().check(z.describe('Team ID.')),
})

export const GetAdminUserRouteV2 = defineRoute({
  path: '/v2/admin/users/:id',
  method: 'GET',
  goodResponses: [GoodAdminUserV2],
  badResponses: [BadPerms, BadToken, BadUnknownUser],
  authRequired: true,
  params: AdminUserParams,
  permissions: Permissions.usersWrite | Permissions.challsRead,
})

export const UpdateAdminUserRouteV2 = defineRoute({
  path: '/v2/admin/users/:id',
  method: 'PUT',
  body: z.object({
    data: z
      .object({
        banned: example(z.optional(z.boolean()), false).check(
          z.describe('Whether the team is banned.')
        ),
        name: z.optional(UserName),
        division: example(z.optional(z.string()), 'open').check(
          z.describe("Team's division.")
        ),
        countryCode: example(
          z.optional(z.nullable(z.enum(ALL_REGIONS.map(r => r.code)))),
          'US'
        ).check(z.describe('ISO 3166-1 alpha-2 country code, or `null`.')),
        statusText: example(
          z.optional(z.nullable(z.string().check(z.maxLength(60)))),
          'Qualified'
        ).check(z.describe('Free-form status badge, or `null`.')),
      })
      .check(z.describe('Team fields to update.')),
  }),
  goodResponses: [GoodAdminUserUpdateV2],
  badResponses: [
    BadBody,
    BadKnownName,
    BadName,
    BadPerms,
    BadToken,
    BadUnknownUser,
    BadUserPrivileged,
  ],
  authRequired: true,
  params: AdminUserParams,
  permissions: Permissions.usersWrite,
})

export const UpdateAdminUserAvatarRouteV2 = defineRoute({
  path: '/v2/admin/users/:id/avatar',
  method: 'PATCH',
  body: z.object({
    avatar: example(z.optional(FileFieldSchema), '<binary avatar image>').check(
      z.describe('Replacement avatar image upload.')
    ),
  }),
  goodResponses: [GoodAvatarUpdated],
  badResponses: [
    BadAvatarFile,
    BadAvatarFileSize,
    BadBody,
    BadModerationNotPassed,
    BadPerms,
    BadToken,
    BadUnknownUser,
    BadUserPrivileged,
  ],
  authRequired: true,
  params: AdminUserParams,
  permissions: Permissions.usersWrite,
  bodyFormat: 'form-data',
})

export const DeleteAdminUserRouteV2 = defineRoute({
  path: '/v2/admin/users/:id',
  method: 'DELETE',
  goodResponses: [GoodAdminUserDeleteV2],
  badResponses: [BadPerms, BadToken, BadUnknownUser, BadUserPrivileged],
  authRequired: true,
  params: AdminUserParams,
  permissions: Permissions.usersWrite,
})

const AdminUserVerificationParams = z.object({
  id: z.string().check(z.describe('Pending verification ID.')),
})

export const GetAdminUserVerificationsRouteV2 = defineRoute({
  path: '/v2/admin/user-verifications',
  method: 'GET',
  goodResponses: [GoodAdminUserVerificationsV2],
  badResponses: [BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const CompleteAdminUserVerificationRouteV2 = defineRoute({
  path: '/v2/admin/user-verifications/:id/complete',
  method: 'POST',
  goodResponses: [GoodAdminUserVerificationCompleteV2],
  badResponses: [
    BadKnownEmail,
    BadKnownName,
    BadPerms,
    BadToken,
    BadUnknownVerification,
  ],
  authRequired: true,
  params: AdminUserVerificationParams,
  permissions: Permissions.usersWrite,
})

export const ResendAdminUserVerificationRouteV2 = defineRoute({
  path: '/v2/admin/user-verifications/:id/resend',
  method: 'POST',
  goodResponses: [GoodAdminUserVerificationResendV2],
  badResponses: [BadEndpoint, BadPerms, BadToken, BadUnknownVerification],
  authRequired: true,
  params: AdminUserVerificationParams,
  permissions: Permissions.usersWrite,
})

const AdminChallengeParams = z.object({
  id: z.string().check(z.describe('Challenge ID.')),
})

export const GetAdminChallengeRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id',
  method: 'GET',
  goodResponses: [GoodAdminChallengeV2],
  badResponses: [BadChallenge, BadPerms, BadToken],
  authRequired: true,
  params: AdminChallengeParams,
  permissions: Permissions.challsRead,
})

export const GetAdminChallengeSolvesRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id/solves',
  method: 'GET',
  goodResponses: [GoodChallengeSolvesV2],
  badResponses: [BadChallenge, BadBody, BadPerms, BadToken],
  authRequired: true,
  params: AdminChallengeParams,
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
  permissions: Permissions.challsRead,
})

export const GetAdminInstanceStatusRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id/instance',
  method: 'GET',
  goodResponses: [GoodInstanceStatus],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadPerms,
    BadToken,
    ErrorInternal,
  ],
  authRequired: true,
  params: AdminChallengeParams,
  permissions: Permissions.challsRead,
})

export const CreateAdminInstanceRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id/instance',
  method: 'PUT',
  goodResponses: [GoodInstanceStatus],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadPerms,
    BadToken,
  ],
  authRequired: true,
  params: AdminChallengeParams,
  permissions: Permissions.challsRead,
})

export const DeleteAdminInstanceRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id/instance',
  method: 'DELETE',
  goodResponses: [GoodInstanceStatus],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadPerms,
    BadToken,
  ],
  authRequired: true,
  params: AdminChallengeParams,
  permissions: Permissions.challsRead,
})

export const ExtendAdminInstanceRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id/instance',
  method: 'PATCH',
  goodResponses: [GoodInstanceStatus],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadPerms,
    BadToken,
  ],
  authRequired: true,
  params: AdminChallengeParams,
  permissions: Permissions.challsRead,
})

export const RunAdminInstanceActionRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id/instance/actions/:action',
  method: 'POST',
  goodResponses: [GoodInstancerActionResult],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadRateLimit,
    BadPerms,
    BadToken,
  ],
  authRequired: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
    action: z.string().check(z.describe('Instancer action name.')),
  }),
  permissions: Permissions.challsRead,
})

export const UpdateChallengeRouteV2 = defineRoute({
  path: '/v2/admin/challs/:id',
  method: 'PUT',
  body: z.object({
    data: z
      .object({
        author: example(z.optional(z.string()), 'es3n1n').check(
          z.describe('Challenge author.')
        ),
        category: example(z.optional(z.string()), 'rev').check(
          z.describe('Challenge category.')
        ),
        description: example(
          z.optional(z.string()),
          'A gentle introduction.'
        ).check(z.describe('Challenge description in Markdown.')),
        flag: example(z.optional(z.string()), 'rctf{baby_rev}').check(
          z.describe(
            'Deprecated scalar flag compatibility field. Use `flags` instead.'
          )
        ),
        flags: example(z.optional(z.array(FlagEntrySchema)), [
          { provider: 'flags/static', config: { flag: 'rctf{baby_rev}' } },
        ]).check(
          z.describe(
            'Flag entries; a submission solves the challenge when any entry validates. Replaces the whole list.'
          )
        ),
        name: example(z.optional(z.string()), 'baby-rev').check(
          z.describe('Challenge name.')
        ),
        points: z.optional(ChallengePointsSchema),
        tiebreakEligible: example(z.optional(z.boolean()), true).check(
          z.describe('Whether solves count toward tiebreak ordering.')
        ),
        files: z.optional(z.array(ChallengeFileSchemaV2)),
        sortWeight: example(z.optional(z.int32()), 0).check(
          z.describe('Manual ordering weight.')
        ),
        tags: example(z.optional(z.array(z.string())), ['beginner']).check(
          z.describe('Free-form tags.')
        ),
        hints: example(
          z.optional(
            z
              .array(z.string().check(z.minLength(1), z.maxLength(10_000)))
              .check(z.maxLength(20))
          ),
          ['Look closely at the response headers.']
        ).check(
          z.describe(
            'Hints shown to players, in Markdown and in order. At most 20, each up to 10,000 characters. Replaces the whole list.'
          )
        ),
        instancerConfig: z
          .nullish(PartialInstancerConfigSchema)
          .check(
            z.describe(
              'On-demand instancer configuration, or `null` to remove it.'
            )
          ),
        adminBotConfig: z
          .nullish(
            z.object({
              code: example(z.string(), 'admin-bot').check(
                z.describe('Admin-bot config code to attach.')
              ),
            })
          )
          .check(
            z.describe('Admin-bot configuration, or `null` to remove it.')
          ),
        hidden: example(z.optional(z.boolean()), false).check(
          z.describe('Whether the challenge is hidden from players.')
        ),
        releaseTime: example(z.optional(z.nullable(z.int())), null).check(
          z.describe(
            'Scheduled release time as a Unix ms timestamp, or `null`.'
          )
        ),
        scoring: z
          .optional(ChallengeScoringSchema)
          .check(z.describe('Scoring algorithm configuration.')),
      })
      .check(z.describe('Challenge fields to update.')),
  }),
  goodResponses: [GoodChallengeUpdateV2],
  badResponses: [
    BadAdminBotConfig,
    BadBody,
    BadInstancerConfig,
    BadPerms,
    BadToken,
  ],
  authRequired: true,
  params: AdminChallengeParams,
  permissions: Permissions.challsWrite,
})

export const UploadFilesRouteV2 = defineRoute({
  path: '/v2/admin/upload',
  method: 'POST',
  body: z.object({
    files: MultipleFileFieldSchema,
  }),
  goodResponses: [GoodFilesUploadV2],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.challsWrite,
  bodyFormat: 'form-data',
})

export const CreateUserTokenRouteV2 = defineRoute({
  path: '/v2/admin/users/:id/token',
  method: 'POST',
  goodResponses: [GoodCreateUserTokenV2],
  badResponses: [BadPerms, BadToken, BadUnknownUser, BadUserPrivileged],
  authRequired: true,
  params: z.object({
    id: z.string().check(z.describe('Team ID.')),
  }),
  permissions: Permissions.usersWrite,
})

export const DeleteChallengeSolveRouteV2 = defineRoute({
  path: '/v2/admin/challs/:challengeId/solves/:userId',
  method: 'DELETE',
  goodResponses: [GoodChallengeSolveDeleteV2],
  badResponses: [BadPerms, BadToken, BadUnknownSolveV2],
  authRequired: true,
  params: z.object({
    challengeId: z.string().check(z.describe('Challenge ID.')),
    userId: z.string().check(z.describe('Team ID whose solve to delete.')),
  }),
  permissions: Permissions.challsSolveWrite,
})

export const DeleteAllChallengeSolvesRouteV2 = defineRoute({
  path: '/v2/admin/users/:userId/solves',
  method: 'DELETE',
  goodResponses: [GoodAllChallengeSolvesDeleteV2],
  badResponses: [BadPerms, BadToken],
  authRequired: true,
  params: z.object({
    userId: z.string().check(z.describe('Team ID whose solves to delete.')),
  }),
  permissions: Permissions.challsSolveWrite,
})

export const GetFlagProvidersRouteV2 = defineRoute({
  path: '/v2/admin/flags/providers',
  method: 'GET',
  goodResponses: [GoodFlagProviders],
  badResponses: [BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.challsRead,
})

export const GetInstancerSchemaRouteV2 = defineRoute({
  path: '/v2/admin/instancer/schema',
  method: 'GET',
  goodResponses: [GoodInstancerSchema],
  badResponses: [BadEndpoint, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.challsRead,
})

export const GetAdminBotStatusRouteV2 = defineRoute({
  path: '/v2/admin/admin-bot/status',
  method: 'GET',
  goodResponses: [GoodAdminBotStatus],
  badResponses: [BadEndpoint, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.challsRead,
})

export const QueryUploadsRouteV2 = defineRoute({
  path: '/v2/admin/upload/query',
  method: 'POST',
  body: z.object({
    uploads: z.array(
      z.object({
        sha256: UploadSha256,
        name: UploadFileName,
      })
    ),
  }),
  goodResponses: [GoodUploadsQueryV2],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.challsRead,
})

export const GetAdminBotChallengeSourceRouteV2 = defineRoute({
  path: '/v2/admin/admin-bot/challenges/:id/source',
  method: 'GET',
  goodResponses: [GoodAdminBotChallengeSource],
  badResponses: [BadEndpoint],
  serviceAuth: 'adminBot',
  params: z.object({ id: z.string().check(z.describe('Challenge ID.')) }),
})

export const GetAdminBotQueueDepthRouteV2 = defineRoute({
  path: '/v2/admin/admin-bot/queue-depth',
  method: 'GET',
  goodResponses: [GoodAdminBotQueueDepth],
  serviceAuth: 'adminBot',
})

export const PullAdminBotJobRouteV2 = defineRoute({
  path: '/v2/admin/admin-bot/jobs/pull',
  method: 'POST',
  goodResponses: [GoodAdminBotJobPull],
  serviceAuth: 'adminBot',
})

export const CompleteAdminBotJobRouteV2 = defineRoute({
  path: '/v2/admin/admin-bot/jobs/:id/complete',
  method: 'POST',
  body: z.object({
    logs: example(
      z.optional(z.string().check(z.maxLength(1_048_576))),
      'Done.'
    ).check(z.describe('Captured job logs.')),
  }),
  goodResponses: [GoodAdminBotJobUpdate],
  badResponses: [BadEndpoint],
  serviceAuth: 'adminBot',
  params: z.object({ id: z.string().check(z.describe('Admin-bot job ID.')) }),
})

export const FailAdminBotJobRouteV2 = defineRoute({
  path: '/v2/admin/admin-bot/jobs/:id/fail',
  method: 'POST',
  body: z.object({
    logs: example(
      z.optional(z.string().check(z.maxLength(1_048_576))),
      'Failed.'
    ).check(z.describe('Captured job logs.')),
  }),
  goodResponses: [GoodAdminBotJobUpdate],
  badResponses: [BadEndpoint],
  serviceAuth: 'adminBot',
  params: z.object({ id: z.string().check(z.describe('Admin-bot job ID.')) }),
})

export const GetAdminLiveLeaderboardRouteV2 = defineRoute({
  path: '/v2/admin/leaderboard/live',
  method: 'GET',
  goodResponses: [GoodLeaderboardV2],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.leaderboardRead,
  query: z.object({
    // NOTE: Has max limits that are loaded from config
    limit: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(1))
      .check(
        z.describe(
          'Maximum number of entries to return. Capped by deployment config.'
        )
      ),
    offset: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(0))
      .check(z.describe('Number of leading entries to skip for pagination.')),
    division: z.optional(
      z.string().check(z.describe('Restrict results to a single division.'))
    ),
  }),
})

export const GetAdminSettingsRouteV2 = defineRoute({
  path: '/v2/admin/settings',
  method: 'GET',
  goodResponses: [GoodAdminSettings],
  badResponses: [BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.settingsWrite,
})

const AdminSettingsUpdateBody = z.object({
  data: z
    .object({
      ctfName: example(z.nullish(z.string()), 'rCTF').check(
        z.describe('Public CTF name.')
      ),
      homeContent: example(z.nullish(z.string()), '# Welcome').check(
        z.describe('Home page content in Markdown.')
      ),
      startTime: example(z.nullish(z.int()), 1710000000000).check(
        z.describe('CTF start time as a Unix ms timestamp.')
      ),
      endTime: example(z.nullish(z.int()), 1710864000000).check(
        z.describe('CTF end time as a Unix ms timestamp.')
      ),
      scoreboardFreezeTime: example(z.nullish(z.int()), 1710777600000).check(
        z.describe(
          'Scoreboard freeze time as a Unix ms timestamp. Must fall within the event. The freeze stays on after the end time; set `null` to reveal the final standings.'
        )
      ),
      maxTeamSize: example(
        z.nullish(z.int().check(z.gte(1)).check(z.lte(1000))),
        4
      ).check(
        z.describe(
          'Maximum players per team. Teams already over a lower limit keep their members but cannot take new ones.'
        )
      ),
      requireSubmissionEvidence: example(z.nullish(z.boolean()), true).check(
        z.describe(
          'Whether flag submissions must include AI links and a solver proof file.'
        )
      ),
      teamCreationEnabled: example(z.nullish(z.boolean()), false).check(
        z.describe(
          'Whether players can create new teams. Joining existing teams is unaffected.'
        )
      ),
      aiLinkPatterns: z.nullish(AiLinkPatternsSchema),
      integrity: z
        .nullish(IntegritySettingsSchema)
        .check(
          z.describe(
            'Cheat detection settings. Replaces the whole object; `null` restores the defaults.'
          )
        ),
      pageAccess: z.nullish(
        z.object({
          challenges: example(
            z.optional(z.enum(PageAccess)),
            PageAccess.Private
          ).check(z.describe('Who may view the challenges page.')),
          scores: example(
            z.optional(z.enum(PageAccess)),
            PageAccess.Public
          ).check(z.describe('Who may view the scoreboard page.')),
        })
      ),
      sponsors: z.nullish(z.array(SponsorUpdateSchemaV2)),
      meta: z.nullish(
        z.object({
          description: example(
            z.optional(z.string()),
            'A jeopardy-style CTF.'
          ).check(z.describe('Site meta description.')),
          imageUrl: example(
            z.optional(z.string()),
            'https://rctf.osec.io/preview.png'
          ).check(z.describe('Social preview image URL.')),
        })
      ),
      faviconUrl: example(
        z.nullish(z.string()),
        'https://rctf.osec.io/favicon.ico'
      ).check(z.describe('Favicon URL.')),
      logoLightUrl: example(
        z.nullish(z.string()),
        'https://rctf.osec.io/logo-light.png'
      ).check(z.describe('Light-theme logo URL.')),
      logoDarkUrl: example(
        z.nullish(z.string()),
        'https://rctf.osec.io/logo-dark.png'
      ).check(z.describe('Dark-theme logo URL.')),
    })
    .check(z.describe('Settings fields to update.')),
})

export const UpdateAdminSettingsRouteV2 = defineRoute({
  path: '/v2/admin/settings',
  method: 'PUT',
  body: AdminSettingsUpdateBody,
  goodResponses: [GoodAdminSettingsUpdate],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.settingsWrite,
})

export const ListExternalAuthClientsRouteV2 = defineRoute({
  path: '/v2/admin/external-auth/clients',
  method: 'GET',
  goodResponses: [GoodAdminExternalAuthClients],
  badResponses: [BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const CreateExternalAuthClientRouteV2 = defineRoute({
  path: '/v2/admin/external-auth/clients',
  method: 'POST',
  body: z.object({
    name: example(
      z.string().check(z.minLength(1)).check(z.maxLength(100)),
      'osec-dashboard'
    ).check(z.describe('Display name for the OAuth client.')),
    redirectUri: example(
      HttpUrl.check(z.maxLength(1024)),
      'https://app.osec.io/callback'
    ).check(z.describe('Allowed OAuth redirect URI.')),
  }),
  goodResponses: [GoodAdminExternalAuthClientCreate],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const DeleteExternalAuthClientRouteV2 = defineRoute({
  path: '/v2/admin/external-auth/clients/:id',
  method: 'DELETE',
  goodResponses: [GoodAdminExternalAuthClientDelete],
  badResponses: [BadExternalAuthRequest, BadPerms, BadToken],
  authRequired: true,
  params: z.object({ id: z.string().check(z.describe('OAuth client ID.')) }),
  permissions: Permissions.usersWrite,
})
