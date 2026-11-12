import { config } from '@rctf/config'
import { CreateUserTokenRouteV2 } from '@rctf/types'
import { createToken, TokenKind } from '../../../../lib/tokens'
import { isAdminUser } from '../../../../services/settings'
import { getUser } from '../../../../services/users.ts'
import adminGroup from '../group'

adminGroup.route(CreateUserTokenRouteV2, async ({ res, ctx, params, user }) => {
  const targetUser = await getUser(ctx.var.db, params.id)
  if (!targetUser) {
    return res.badUnknownUser()
  }

  // with Discord login only admin teams can log in with a team token, so a
  // player team's token would be useless
  if (config.discord && !isAdminUser(targetUser)) {
    return res.badEndpoint()
  }

  // a privileged team's token is only handed to admins who already hold all
  // of its permissions, so it can't be used to gain more
  if (targetUser.perms > 0 && (targetUser.perms & ~user.perms) !== 0) {
    return res.badUserPrivileged()
  }

  return res.goodCreateUserTokenV2({
    token: await createToken(TokenKind.Team, targetUser.id),
  })
})
