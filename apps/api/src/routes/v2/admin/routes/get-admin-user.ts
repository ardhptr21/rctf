import { GetAdminUserRouteV2 } from '@rctf/types'
import { getTeamMembers } from '../../../../services/teams'
import { getAdminUserWithSolves } from '../../../../services/users'
import adminGroup from '../group'

adminGroup.route(GetAdminUserRouteV2, async ({ res, ctx, params }) => {
  const user = await getAdminUserWithSolves(ctx.var.db, params.id)
  if (!user) {
    return res.badUnknownUser()
  }

  const members = await getTeamMembers(ctx.var.db, params.id)
  return res.goodAdminUserV2({
    ...user,
    members: members.map(member => ({
      id: member.id,
      discordId: member.discordId,
      discordUsername: member.discordUsername,
      displayName: member.displayName ?? null,
      avatarUrl: member.avatarUrl ?? null,
      isCaptain: member.isCaptain ?? false,
    })),
  })
})
