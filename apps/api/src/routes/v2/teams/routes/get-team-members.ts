import { GetTeamMembersRouteV2 } from '@rctf/types'
import { getResolvedSettings } from '../../../../services/settings'
import {
  getJoinToken,
  getTeamMembers,
  teamSizeLimit,
} from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf } from '../util'

teamsGroup.route(GetTeamMembersRouteV2, async ({ ctx, res, user }) => {
  const player = playerOf(ctx)
  if (!player.teamId || !user) {
    return res.badNoTeam()
  }

  const members = await getTeamMembers(ctx.var.db, player.teamId)
  return res.goodTeamMembers({
    members: members.map(member => ({
      id: member.id,
      discordId: member.discordId,
      discordUsername: member.discordUsername,
      displayName: member.displayName ?? null,
      avatarUrl: member.avatarUrl ?? null,
      isCaptain: member.isCaptain ?? false,
      joinedAt: member.joinedTeamAt
        ? new Date(member.joinedTeamAt).getTime()
        : null,
    })),
    maxTeamSize: teamSizeLimit(
      user,
      (await getResolvedSettings(ctx.var.db, ctx.var.redis)).maxTeamSize
    ),
    joinToken: player.isCaptain
      ? await getJoinToken(ctx.var.db, player.teamId)
      : null,
  })
})
