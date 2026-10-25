import { GetUserRouteV2 } from '@rctf/types'
import { getFullUserFromId } from '../../../../services/full-user'
import {
  getFreezeCutoffForViewer,
  isAdminUser,
} from '../../../../services/settings'
import usersGroup from '../group'

usersGroup.route(GetUserRouteV2, async ({ ctx, res, user, params: { id } }) => {
  // owners always see their own solves, even while the scoreboard is frozen
  const solveCutoff =
    user?.id === id
      ? null
      : await getFreezeCutoffForViewer(ctx.var.db, ctx.var.redis, user)
  const fullUser = await getFullUserFromId(ctx.var.db, id, solveCutoff)
  if (!fullUser) {
    return res.badUnknownUser()
  }
  // admin teams take no part in the standings, so only the team itself and
  // other admins can see their profile
  if (isAdminUser(fullUser) && user?.id !== id && !isAdminUser(user)) {
    return res.badUnknownUser()
  }
  return res.goodUserDataV2({
    ...fullUser,
    avatarUrl: fullUser.avatarUrl ?? null,
    countryCode: fullUser.countryCode ?? null,
    statusText: fullUser.statusText ?? null,
  })
})
