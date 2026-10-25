import {
  DeleteAdminPlayerRouteV2,
  GetAdminPlayersRouteV2,
  MakeAdminPlayerCaptainRouteV2,
  SetAdminPlayerBannedRouteV2,
  SetAdminPlayerTeamRouteV2,
} from '@rctf/types'
import {
  getAdminPlayer,
  listAdminPlayers,
  setAdminPlayerBanned,
} from '../../../../services/admin-players'
import {
  adminDeletePlayer,
  adminMakeCaptain,
  adminSetPlayerTeam,
} from '../../../../services/teams'
import adminGroup from '../group'

adminGroup.route(GetAdminPlayersRouteV2, async ({ ctx, res, query }) =>
  res.goodAdminPlayers(await listAdminPlayers(ctx.var.db, query))
)

adminGroup.route(
  SetAdminPlayerTeamRouteV2,
  async ({ ctx, res, params, body }) => {
    const result = await adminSetPlayerTeam(
      ctx.var.db,
      ctx.var.redis,
      params.id,
      body.teamId
    )
    if (!result.ok) {
      switch (result.error) {
        case 'badPlayerNotFound':
          return res.badPlayerNotFound()
        case 'badPlayerNoTeam':
          return res.badPlayerNoTeam()
        case 'badPlayerAlreadyInTeam':
          return res.badPlayerAlreadyInTeam()
        case 'badUnknownUser':
          return res.badUnknownUser()
        case 'badTeamBanned':
          return res.badTeamBanned()
        case 'badTeamFull':
          return res.badTeamFull()
      }
    }

    const player = await getAdminPlayer(ctx.var.db, params.id)
    return player ? res.goodAdminPlayerUpdate(player) : res.badPlayerNotFound()
  }
)

adminGroup.route(
  MakeAdminPlayerCaptainRouteV2,
  async ({ ctx, res, params }) => {
    const result = await adminMakeCaptain(ctx.var.db, ctx.var.redis, params.id)
    if (!result.ok) {
      return result.error === 'badPlayerNoTeam'
        ? res.badPlayerNoTeam()
        : res.badPlayerNotFound()
    }

    const player = await getAdminPlayer(ctx.var.db, params.id)
    return player ? res.goodAdminPlayerUpdate(player) : res.badPlayerNotFound()
  }
)

adminGroup.route(
  SetAdminPlayerBannedRouteV2,
  async ({ ctx, res, params, body }) => {
    const found = await setAdminPlayerBanned(
      ctx.var.db,
      ctx.var.redis,
      params.id,
      body.banned
    )
    const player = found
      ? await getAdminPlayer(ctx.var.db, params.id)
      : undefined
    return player ? res.goodAdminPlayerUpdate(player) : res.badPlayerNotFound()
  }
)

adminGroup.route(DeleteAdminPlayerRouteV2, async ({ ctx, res, params }) => {
  const result = await adminDeletePlayer(ctx.var.db, ctx.var.redis, params.id)
  if (result.ok) {
    return res.goodAdminPlayerDelete()
  }
  return result.error === 'badPlayerBanned'
    ? res.badPlayerBanned()
    : res.badPlayerNotFound()
})
