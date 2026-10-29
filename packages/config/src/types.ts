import {
  IntegritySeverity,
  isAiLinkPattern,
  isIpRule,
  normalizeSponsorIcons,
  NumericString,
  PageAccess,
  ProtectedAction,
} from '@rctf/types'
import { z } from 'zod/mini'

export { PageAccess, ProtectedAction }

export const ProviderConfigSchema = z.object({
  name: z.string(),
  options: z._default(z.unknown(), {}),
})

export const SponsorSchema = z.pipe(
  z.object({
    name: z.string(),
    icon: z.optional(z.string()),
    iconLight: z._default(z.string(), ''),
    iconDark: z._default(z.string(), ''),
    description: z.string(),
    url: z.optional(z.string()),
  }),
  z.transform(normalizeSponsorIcons)
)

// Division access control: matches field `match` against `value`, applies to listed divisions
export const ACLSchema = z.object({
  match: z.string(),
  value: z.string(),
  divisions: z.array(z.string()),
})

export const SqlDatabaseSchema = z.union([
  z.string(), // connection string
  z.object({
    host: z.string(),
    port: z.optional(z.number()),
    user: z.string(),
    password: z.string(),
    database: z.string(),
    maxPoolSize: z._default(z.int(), 100),
    idleTimeout: z._default(z.int(), 30_000),
    connectTimeout: z._default(z.int(), 3_000),
  }),
])

export const DEFAULT_REDIS_SOCKET_TIMEOUT = 6_000

export const RedisDatabaseSchema = z.union([
  z.string(), // connection string
  z.object({
    host: z.string(),
    port: z.optional(z.number()),
    password: z.optional(z.string()),
    database: z.optional(z.number()),
    socketTimeout: z._default(z.int(), DEFAULT_REDIS_SOCKET_TIMEOUT),
  }),
])

export const ServerConfigSchema = z.object({
  // Core
  ctfName: z.string(),
  origin: z.string(),
  tokenKey: z.string(),
  instanceType: z._default(z.enum(['leaderboard', 'all', 'frontend']), 'all'),
  shutdownTimeout: z._default(z.int().check(z.gte(0)), 30_000),
  idleTimeout: z._default(z.int().check(z.gte(0), z.lte(255)), 65),
  maxRequestBodySize: z._default(
    z.int().check(z.gte(1)),
    1024 * 1024 * 1024 // 1gb
  ),

  // Database
  database: z.object({
    sql: SqlDatabaseSchema,
    redis: RedisDatabaseSchema,
    migrate: z._default(z.enum(['before', 'only', 'never']), 'never'),
  }),

  // CTF timing
  startTime: z.number(), // unix ms
  endTime: z.number(), // unix ms
  scoreboardFreezeTime: z.optional(z.number()), // unix ms, lasts until cleared

  // Page access
  pageAccess: z.prefault(
    z.object({
      challenges: z._default(z.enum(PageAccess), PageAccess.Public),
      scores: z._default(z.enum(PageAccess), PageAccess.Public),
    }),
    {}
  ),

  // Divisions
  divisions: z._default(z.record(z.string(), z.string()), { open: 'Open' }), // id -> display name
  defaultDivision: z.optional(z.string()),
  divisionACLs: z.optional(z.array(ACLSchema)),

  // Auth
  registrationsEnabled: z._default(z.boolean(), true),
  userMembers: z._default(z.boolean(), true),
  maxMembers: z._default(z.number(), 50),
  loginTimeout: z._default(z.number(), 3_600_000),
  ctftime: z.optional(
    z.object({
      clientId: NumericString,
      clientSecret: z.string(),
    })
  ),
  // when set, players log in with Discord and form teams themselves
  discord: z.optional(
    z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      requiredGuildId: z.optional(z.string()),
    })
  ),
  maxTeamSize: z._default(z.int().check(z.gte(1)), 4), // admin teams are unlimited
  teamCreationEnabled: z._default(z.boolean(), true), // players may create teams

  // Flag submissions must include AI links and a solver proof file. Each
  // requirement can be set on its own; unset, it follows the older
  // requireSubmissionEvidence, which covers both
  requireSubmissionEvidence: z._default(z.boolean(), true),
  requireAiLinks: z.optional(z.boolean()),
  requireSolverProof: z.optional(z.boolean()),
  maxProofSize: z._default(z.int().check(z.gte(1)), 5 * 1024 * 1024),
  // allowed AI link sites, as regular expressions; cheat detection records
  // links matching none of them
  aiLinkPatterns: z._default(
    z.array(
      z.string().check(
        z.refine(isAiLinkPattern, {
          message: 'must be a valid regular expression',
        })
      )
    ),
    []
  ),

  // Cheat detection: defaults for the admin "Cheat detection" settings, and
  // the alert destinations, which stay config-only since they hold secrets
  integrity: z.prefault(
    z.object({
      detectors: z.prefault(
        z.object({
          flagSharing: z._default(z.boolean(), true),
          sharedIp: z._default(z.boolean(), true),
          duplicateProof: z._default(z.boolean(), true),
          duplicateAiLink: z._default(z.boolean(), true),
          solvedWithoutDownload: z._default(z.boolean(), true),
          unlistedAiLink: z._default(z.boolean(), true),
          mixedAiSource: z._default(z.boolean(), false),
        }),
        {}
      ),
      sharedIpWindowHours: z._default(
        z.int().check(z.gte(1)).check(z.lte(720)),
        24
      ),
      ipAllowlist: z._default(
        z.array(
          z.string().check(
            z.refine(isIpRule, {
              message: 'must be an IP address or CIDR range',
            })
          )
        ),
        []
      ),
      alerts: z._default(z.boolean(), true),
      alertDestinations: z._default(
        z.array(z.object({ provider: ProviderConfigSchema })),
        []
      ),
      alertMinSeverity: z._default(
        z.enum(IntegritySeverity),
        IntegritySeverity.HIGH
      ),
    }),
    {}
  ),

  // Captcha
  captcha: z.optional(
    z.object({
      provider: z.optional(ProviderConfigSchema),
      protectedEndpoints: z._default(
        z.array(z.enum(ProtectedAction)),
        Object.values(ProtectedAction)
      ),
    })
  ),

  // Backport for v1 recaptcha config
  recaptcha: z.optional(
    z.object({
      siteKey: z.optional(z.string()),
      secretKey: z.optional(z.string()),
      protectedActions: z.optional(z.array(z.enum(ProtectedAction))),
    })
  ),

  // Providers
  uploadProvider: z.prefault(ProviderConfigSchema, {
    name: 'uploads/local',
  }),
  scoreProvider: z.prefault(ProviderConfigSchema, {
    name: 'scores/classic',
  }),
  instancers: z.optional(z.record(z.string(), ProviderConfigSchema)),
  defaultInstancer: z.optional(z.string()),
  adminBot: z.optional(
    z.object({
      provider: ProviderConfigSchema,
      maxLogsPerUserChallenge: z._default(z.int(), 5),
    })
  ),
  email: z.optional(
    z.object({
      provider: ProviderConfigSchema,
      from: z.string(),
      logoUrl: z.optional(z.string()),
    })
  ),

  // UI
  homeContent: z._default(z.string(), 'Home content. Markdown supported.'),
  sponsors: z._default(z.array(SponsorSchema), []),
  meta: z.prefault(
    z.object({
      description: z.prefault(z.string(), 'rCTF event description'),
      imageUrl: z.prefault(z.string(), ''),
    }),
    {}
  ),
  faviconUrl: z._default(
    z.string(),
    'https://redpwn.storage.googleapis.com/branding/rctf-favicon.ico'
  ),
  logoLightUrl: z._default(z.string(), ''),
  logoDarkUrl: z._default(z.string(), ''),
  flagFormatPlaceholder: z._default(z.string(), 'flag{[\\x20-\\x7e]+}'),

  // Analytics
  analytics: z.optional(
    z.object({
      provider: ProviderConfigSchema,
    })
  ),

  // Deprecated, use analytics.provider with name 'analytics/google' instead
  globalSiteTag: z.optional(z.string()),

  // Limits
  maxAvatarSize: z._default(z.number(), 1024 * 1024),
  leaderboard: z.prefault(
    z.object({
      maxLimit: z._default(z.number(), 100),
      maxOffset: z._default(z.number(), 4294967296),
      updateInterval: z._default(z.number(), 30_000), // 30s, but we force recalc when needed
      graphMaxTeams: z._default(z.number(), 10),
      graphSampleTime: z._default(z.number(), 300_000), // 5min
      graphWithListLimit: z._default(z.number(), 100),
    }),
    {}
  ),

  // Moderation
  avatarsModeration: z.optional(
    z.object({
      provider: ProviderConfigSchema,
      allowOnInternalError: z._default(z.boolean(), true),
    })
  ),

  // Proxy
  proxy: z.prefault(
    z.object({
      cloudflare: z._default(z.boolean(), false),
      trust: z._default(
        z.union([z.boolean(), z.string(), z.array(z.string()), z.number()]),
        2
      ),
    }),
    {}
  ),

  csp: z._default(z.record(z.string(), z.array(z.string())), {}),

  // First blood messages
  bloodBot: z.optional(
    z.object({
      bloodsCount: z._default(z.number().check(z.minimum(1)), 1),
      destinations: z.pipe(
        z
          .array(
            z.object({
              provider: ProviderConfigSchema,
              bloodEmojis: z._default(z.array(z.string()), []),
              messageTemplate: z.optional(z.string()),
            })
          )
          .check(z.minLength(1)),
        z.transform(val =>
          val.map(({ provider, bloodEmojis, messageTemplate }) => {
            // Telegram does not support [`...`](https://...) links, lol
            // we also need to escape the ! character for telegram
            const isTelegram = provider.name === 'messages/telegram'
            return {
              provider,
              bloodEmojis,
              messageTemplate:
                messageTemplate ??
                (isTelegram
                  ? '{{#bloodEmoji}}{{bloodEmoji}} {{/bloodEmoji}}Congratulations to [*{{teamName}}*]({{teamUrl}}) for {{bloodNumSentence}} blood on `{{challengeCategory}}/{{challengeName}}`\\!'
                  : '{{#bloodEmoji}}{{bloodEmoji}} {{/bloodEmoji}}Congratulations to [`{{teamName}}`]({{teamUrl}}) for {{bloodNumSentence}} blood on `{{challengeCategory}}/{{challengeName}}`!'),
            }
          })
        )
      ),
    })
  ),
})
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>
export type Sponsor = z.infer<typeof SponsorSchema>
export type ACL = z.infer<typeof ACLSchema>
export type ServerConfig = z.infer<typeof ServerConfigSchema>
