import { UpdateAdminSettingsRouteV2 } from '@rctf/types'
import {
  getConfigDefaults,
  getSettings,
  patchSettings,
  resolveSettings,
  updateSettings,
} from '../../../../services/settings'
import {
  forceLeaderboardUpdate,
  requestAllChallengesRecompute,
} from '../../../../workers'
import adminGroup from '../group'

adminGroup.route(UpdateAdminSettingsRouteV2, async ({ res, ctx, body }) => {
  const next = resolveSettings(
    patchSettings(await getSettings(ctx.var.db), body.data)
  )
  const freezeTime = next.scoreboardFreezeTime
  if (
    freezeTime !== null &&
    (freezeTime < next.startTime || freezeTime >= next.endTime)
  ) {
    return res.badBody({
      reason: 'Scoreboard freeze time must be within the start and end time',
    })
  }

  const overrides = await updateSettings(ctx.var.db, body.data, ctx.var.redis)
  if ('startTime' in body.data || 'endTime' in body.data) {
    requestAllChallengesRecompute(ctx.var.redis, 'algo-change')
    forceLeaderboardUpdate(ctx.var.redis)
  } else if ('scoreboardFreezeTime' in body.data) {
    forceLeaderboardUpdate(ctx.var.redis)
  }
  const defaults = getConfigDefaults()
  return res.goodAdminSettingsUpdate({ overrides, defaults })
})
