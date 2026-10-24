import { GetUserRoute } from '@rctf/types'
import { getFullUserFromId } from '../../../../services/full-user'
import { getFreezeCutoffForViewer } from '../../../../services/settings'
import usersGroup from '../group'

usersGroup.route(GetUserRoute, async ({ ctx, res, user, params: { id } }) => {
  // owners always see their own solves, even while the scoreboard is frozen
  const solveCutoff =
    user?.id === id
      ? null
      : await getFreezeCutoffForViewer(ctx.var.db, ctx.var.redis, user)
  const fullUser = await getFullUserFromId(ctx.var.db, id, solveCutoff)
  if (!fullUser) {
    return res.badUnknownUser()
  }
  return res.goodUserData(fullUser)
})
