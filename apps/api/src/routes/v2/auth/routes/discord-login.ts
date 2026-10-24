import { config } from '@rctf/config'
import { DiscordLoginRouteV2 } from '@rctf/types'
import { createToken, TokenKind } from '../../../../lib/tokens'
import {
  discordRedirectUri,
  exchangeDiscordCode,
} from '../../../../services/discord'
import { upsertDiscordPlayer } from '../../../../services/players'
import authGroup from '../group'

authGroup.route(DiscordLoginRouteV2, async ({ ctx, res, body }) => {
  if (!config.discord) {
    return res.badEndpoint()
  }
  if (body.redirectUri !== discordRedirectUri()) {
    return res.badBody({ reason: 'Unexpected redirect URI' })
  }

  const result = await exchangeDiscordCode(body.code)
  if (!result.ok) {
    return result.error === 'badDiscordGuild'
      ? res.badDiscordGuild()
      : res.badDiscordCode()
  }

  const player = await upsertDiscordPlayer(
    ctx.var.db,
    ctx.var.redis,
    result.profile
  )
  return res.goodDiscordLogin({
    authToken: await createToken(TokenKind.PlayerAuth, player.id),
  })
})
