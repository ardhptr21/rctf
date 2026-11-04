import { config } from '@rctf/config'
import type { User } from '@rctf/db'
import { LoginRoute } from '@rctf/types'
import { createToken, parseToken, TokenKind } from '../../../../lib/tokens'
import { isAdminUser } from '../../../../services/settings'
import { getUser, getUserByCtftimeId } from '../../../../services/users'
import authGroup from '../group'

authGroup.route(LoginRoute, async ({ ctx, res, body }) => {
  let user: User | undefined

  // With Discord login, players sign in with Discord; only admin team
  // tokens still work, so deploy tools can reach the admin API
  if (config.discord && body.ctftimeToken) {
    return res.badEndpoint()
  }

  if (body.ctftimeToken) {
    // Login with ctftime:
    const ctfTimeToken = await parseToken(
      TokenKind.CtftimeAuth,
      body.ctftimeToken ?? ''
    )
    if (!ctfTimeToken) {
      return res.badCtftimeToken()
    }
    user = await getUserByCtftimeId(ctx.var.db, ctfTimeToken.ctftimeId)
  } else {
    // Login with team token:
    const teamId = await parseToken(TokenKind.Team, body.teamToken ?? '')
    if (!teamId) {
      return res.badTokenVerification()
    }
    user = await getUser(ctx.var.db, teamId)
  }

  if (!user) {
    return res.badUnknownUser()
  }

  if (config.discord && !isAdminUser(user)) {
    return res.badEndpoint()
  }

  const authToken = await createToken(TokenKind.Auth, user.id)
  return res.goodLogin({ authToken })
})
