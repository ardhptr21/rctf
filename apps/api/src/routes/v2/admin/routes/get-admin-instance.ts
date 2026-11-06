import {
  GetAdminInstanceRequestsRouteV2,
  GetAdminInstanceRouteV2,
  GetAdminInstanceSessionsRouteV2,
} from '@rctf/types'
import { getAdminInstance } from '../../../../services/instance-history'
import {
  getInstanceRequests,
  getInstanceRequestSummary,
} from '../../../../services/instance-requests'
import {
  getInstanceSessions,
  getInstanceSessionSummary,
} from '../../../../services/instance-sessions'
import adminGroup from '../group'

adminGroup.route(GetAdminInstanceRouteV2, async ({ ctx, res, params }) => {
  const found = await getAdminInstance(ctx.var.db, params.id)
  if (!found) {
    return res.badUnknownInstance()
  }
  const { firstRequestAt, lastRequestAt, lastSessionAt, ...instance } = found
  const [summary, sessionSummary] = await Promise.all([
    getInstanceRequestSummary(ctx.var.db, params.id),
    getInstanceSessionSummary(ctx.var.db, params.id),
  ])
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
    sessions: {
      total: instance.sessionCount,
      kept: sessionSummary.kept,
      lastAt: lastSessionAt,
      uniqueIps: sessionSummary.uniqueIps,
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

adminGroup.route(
  GetAdminInstanceSessionsRouteV2,
  async ({ ctx, res, params, query }) => {
    if (!(await getAdminInstance(ctx.var.db, params.id))) {
      return res.badUnknownInstance()
    }
    return res.goodAdminInstanceSessions(
      await getInstanceSessions(ctx.var.db, params.id, {
        limit: query.limit,
        offset: query.offset,
        clientIp: query.clientIp,
      })
    )
  }
)
