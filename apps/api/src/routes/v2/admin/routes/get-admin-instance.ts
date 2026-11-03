import {
  GetAdminInstanceRequestsRouteV2,
  GetAdminInstanceRouteV2,
} from '@rctf/types'
import { getAdminInstance } from '../../../../services/instance-history'
import {
  getInstanceRequests,
  getInstanceRequestSummary,
} from '../../../../services/instance-requests'
import adminGroup from '../group'

adminGroup.route(GetAdminInstanceRouteV2, async ({ ctx, res, params }) => {
  const found = await getAdminInstance(ctx.var.db, params.id)
  if (!found) {
    return res.badUnknownInstance()
  }
  const { firstRequestAt, lastRequestAt, ...instance } = found
  const summary = await getInstanceRequestSummary(ctx.var.db, params.id)
  return res.goodAdminInstance({
    instance,
    requests: {
      total: instance.requestCount,
      kept: summary.kept,
      firstAt: firstRequestAt,
      lastAt: lastRequestAt,
      uniqueIps: summary.uniqueIps,
      statusClasses: {
        '2xx': summary.status2xx,
        '3xx': summary.status3xx,
        '4xx': summary.status4xx,
        '5xx': summary.status5xx,
      },
    },
  })
})

adminGroup.route(
  GetAdminInstanceRequestsRouteV2,
  async ({ ctx, res, params, query }) => {
    if (!(await getAdminInstance(ctx.var.db, params.id))) {
      return res.badUnknownInstance()
    }
    return res.goodAdminInstanceRequests(
      await getInstanceRequests(ctx.var.db, params.id, {
        limit: query.limit,
        offset: query.offset,
        clientIp: query.clientIp,
        statusClass: query.statusClass,
        pathSearch: query.path,
      })
    )
  }
)
