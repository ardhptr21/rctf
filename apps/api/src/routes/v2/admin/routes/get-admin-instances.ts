import { FilterAdminInstancesRouteV2 } from '@rctf/types'
import { getAdminInstances } from '../../../../services/instance-history'
import adminGroup from '../group'

adminGroup.route(
  FilterAdminInstancesRouteV2,
  async ({ ctx, res, query, body }) =>
    res.goodAdminInstances(
      await getAdminInstances(ctx.var.db, { ...query, ...body })
    )
)
