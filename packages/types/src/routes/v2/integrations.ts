import { z } from 'zod/mini'
import { Permissions, ProtectedAction } from '../../enums'
import { defineRoute } from '../../internal'
import {
  BadAdminBotConfig,
  BadCaptcha,
  BadChallenge,
  BadEndpoint,
  BadInstancerError,
  BadInstancerState,
  BadPerms,
  BadRateLimit,
  BadToken,
  ErrorInternal,
  GoodAdminBotConfig,
  GoodAdminBotJobHistory,
  GoodAdminBotJobLogs,
  GoodAdminBotJobStatus,
  GoodAdminBotJobSubmitted,
  GoodClientConfigV2,
  GoodInstancerActionResult,
  GoodInstanceRequestsIngest,
  GoodInstanceSessionsIngest,
  GoodInstanceStatus,
} from '../../responses'

export const GetClientConfigRouteV2 = defineRoute({
  path: '/v2/integrations/client/config',
  method: 'GET',
  goodResponses: [GoodClientConfigV2],
  authRequired: false,
})

export const GetInstanceStatusRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/instance',
  method: 'GET',
  goodResponses: [GoodInstanceStatus],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadPerms,
    ErrorInternal,
  ],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const CreateInstanceRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/instance',
  method: 'PUT',
  captchaAction: ProtectedAction.InstancerStart,
  body: z.object({
    captchaCode: z
      .optional(z.string())
      .check(z.describe('Checked only when captcha protects this route.')),
  }),
  goodResponses: [GoodInstanceStatus],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadCaptcha,
    BadPerms,
  ],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const DeleteInstanceRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/instance',
  method: 'DELETE',
  goodResponses: [GoodInstanceStatus],
  badResponses: [BadInstancerError, BadEndpoint, BadChallenge, BadPerms],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const ExtendInstanceRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/instance',
  method: 'PATCH',
  captchaAction: ProtectedAction.InstancerExtend,
  body: z.object({
    captchaCode: z
      .optional(z.string())
      .check(z.describe('Checked only when captcha protects this route.')),
  }),
  goodResponses: [GoodInstanceStatus],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadCaptcha,
    BadPerms,
  ],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const RunInstanceActionRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/instance/actions/:action',
  method: 'POST',
  goodResponses: [GoodInstancerActionResult],
  badResponses: [
    BadInstancerError,
    BadEndpoint,
    BadChallenge,
    BadRateLimit,
    BadPerms,
  ],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
    action: z.string().check(z.describe('Instancer action name.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const GetAdminBotConfigRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/admin-bot/config',
  method: 'GET',
  goodResponses: [GoodAdminBotConfig],
  badResponses: [BadEndpoint, BadChallenge, BadToken],
  authRequired: false,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const GetAdminBotJobStatusRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/admin-bot/status',
  method: 'GET',
  goodResponses: [GoodAdminBotJobStatus],
  badResponses: [BadEndpoint, BadChallenge, BadToken, BadPerms],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const GetAdminBotJobHistoryRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/admin-bot/history',
  method: 'GET',
  goodResponses: [GoodAdminBotJobHistory],
  badResponses: [BadEndpoint, BadChallenge, BadToken, BadPerms],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const GetAdminBotJobLogsRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/admin-bot/jobs/:jobId/logs',
  method: 'GET',
  goodResponses: [GoodAdminBotJobLogs],
  badResponses: [BadEndpoint, BadChallenge, BadToken, BadPerms],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
    jobId: z.string().check(z.describe('Admin-bot job ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const SubmitAdminBotJobRouteV2 = defineRoute({
  path: '/v2/integrations/challs/:id/admin-bot',
  method: 'POST',
  captchaAction: ProtectedAction.AdminBotSubmit,
  body: z.object({
    inputs: z
      .record(
        z.string().check(z.maxLength(256)),
        z.string().check(z.maxLength(1024))
      )
      .check(
        z.describe('Admin-bot input values keyed by the config field name.')
      ),
    captchaCode: z
      .optional(z.string())
      .check(z.describe('Checked only when captcha protects this route.')),
  }),
  goodResponses: [GoodAdminBotJobSubmitted],
  badResponses: [
    BadAdminBotConfig,
    BadCaptcha,
    BadInstancerState,
    BadEndpoint,
    BadChallenge,
    BadRateLimit,
    BadPerms,
    BadToken,
  ],
  authRequired: true,
  rejectBanned: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

// Batches of the instancer's Traefik JSON access log, sent by a log shipper.
export const IngestInstanceRequestsRouteV2 = defineRoute({
  path: '/v2/integrations/instance-requests',
  method: 'POST',
  body: z.object({
    entries: z
      .array(z.record(z.string(), z.unknown()))
      .check(z.maxLength(1000))
      .check(
        z.describe(
          'Traefik access log entries in JSON format, at most 1000. Other fields are ignored.'
        )
      ),
  }),
  goodResponses: [GoodInstanceRequestsIngest],
  badResponses: [BadToken],
  authRequired: false,
  serviceAuth: 'instanceRequestLogs',
})

export const IngestInstanceSessionsRouteV2 = defineRoute({
  path: '/v2/integrations/instance-sessions',
  method: 'POST',
  body: z.object({
    entries: z
      .array(z.record(z.string(), z.unknown()))
      .check(z.maxLength(500))
      .check(
        z.describe(
          "Connection records from the instancer's tcplog proxy, at most 500. A record with an `id` already stored for the instance replaces it."
        )
      ),
  }),
  goodResponses: [GoodInstanceSessionsIngest],
  badResponses: [BadToken],
  authRequired: false,
  serviceAuth: 'instanceRequestLogs',
})
