import { config } from '@rctf/config'
import { GetPlayerSelfRouteV2 } from '@rctf/types'
import { getTeamSummary, isRosterLocked } from '../../../../services/teams'
import teamsGroup from '../group'
import { playerOf } from '../util'

teamsGroup.route(GetPlayerSelfRouteV2, async ({ ctx, res }) => {
  const player = playerOf(ctx)
  const team = player.teamId
    ? await getTeamSummary(ctx.var.db, player.teamId)
    : undefined

  return res.goodPlayerSelf({
    player: {
      id: player.id,
      discordId: player.discordId,
      discordUsername: player.discordUsername,
      displayName: player.displayName ?? null,
      avatarUrl: player.avatarUrl ?? null,
      isCaptain: player.isCaptain ?? false,
    },
    team: team ?? null,
    maxTeamSize: config.maxTeamSize,
    rosterLocked: await isRosterLocked(ctx.var.db, ctx.var.redis),
  })
})
