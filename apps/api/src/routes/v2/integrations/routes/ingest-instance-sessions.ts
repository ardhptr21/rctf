import { IngestInstanceSessionsRouteV2 } from '@rctf/types'
import { ingestInstanceSessions } from '../../../../services/instance-sessions'
import integrationsGroup from '../group'

integrationsGroup.route(
  IngestInstanceSessionsRouteV2,
  async ({ ctx, res, body }) =>
    res.goodInstanceSessionsIngest(
      await ingestInstanceSessions(ctx.var.db, body.entries)
    )
)
