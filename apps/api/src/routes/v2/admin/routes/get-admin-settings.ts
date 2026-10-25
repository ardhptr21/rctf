import { GetAdminSettingsRouteV2 } from '@rctf/types'
import {
  getConfigDefaults,
  getSettings,
  integrityAlertsConfigured,
} from '../../../../services/settings'
import adminGroup from '../group'

adminGroup.route(GetAdminSettingsRouteV2, async ({ res, ctx }) => {
  const overrides = await getSettings(ctx.var.db)
  const defaults = getConfigDefaults()
  return res.goodAdminSettings({
    overrides,
    defaults,
    integrityAlertsConfigured: integrityAlertsConfigured(),
  })
})
