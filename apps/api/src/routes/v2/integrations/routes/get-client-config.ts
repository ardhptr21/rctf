import { config } from '@rctf/config'
import { GetClientConfigRouteV2, ProtectedAction } from '@rctf/types'
import { captchaProvider } from '../../../../providers/instances/captcha'
import { instancerEnabled } from '../../../../providers/instances/instancer'
import { getResolvedSettings } from '../../../../services/settings'
import integrationsGroup from '../group'

const getAnalyticsConfig = () => {
  if (config.analytics?.provider) {
    return {
      provider: config.analytics.provider.name,
      publicOptions: (config.analytics.provider.options ?? {}) as Record<
        string,
        string
      >,
    }
  }

  return null
}

integrationsGroup.route(GetClientConfigRouteV2, async ({ res, ctx }) => {
  const resolved = await getResolvedSettings(ctx.var.db, ctx.var.redis)
  return res.goodClientConfigV2({
    ...resolved,
    flagFormatPlaceholder: config.flagFormatPlaceholder,
    divisions: config.divisions,
    defaultDivision: config.defaultDivision ?? null,
    origin: config.origin,
    // Discord mode replaces email members and CTFtime with player accounts
    userMembers: config.discord ? false : config.userMembers,
    // email sign-in and recovery are replaced by Discord login
    emailEnabled: !config.discord && Boolean(config.email),
    analytics: getAnalyticsConfig(),
    registrationsEnabled: config.registrationsEnabled ?? null,
    ctftime: config.discord ? null : (config.ctftime ?? null),
    discord: config.discord
      ? {
          clientId: config.discord.clientId,
          requireGuild: Boolean(config.discord.requiredGuildId),
        }
      : null,
    maxTeamSize: config.maxTeamSize,
    instancerEnabled,
    isArchived: false,
    captcha: captchaProvider
      ? {
          provider: config.captcha!.provider!.name,
          publicOptions: captchaProvider.getPublicOptions(),
          protectedEndpoints: Object.fromEntries(
            Object.values(ProtectedAction).map(action => [
              action,
              config.captcha!.protectedEndpoints?.includes(action) ?? false,
            ])
          ) as Record<ProtectedAction, boolean>,
        }
      : null,
  })
})
