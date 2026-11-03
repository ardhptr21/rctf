import { IngestInstanceRequestsRouteV2 } from '@rctf/types'
import { ingestInstanceRequests } from '../../../../services/instance-requests'
import integrationsGroup from '../group'

integrationsGroup.route(
  IngestInstanceRequestsRouteV2,
  async ({ ctx, res, body }) =>
    res.goodInstanceRequestsIngest(
      await ingestInstanceRequests(ctx.var.db, body.entries)
    )
)
