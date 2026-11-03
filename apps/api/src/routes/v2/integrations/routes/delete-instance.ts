import { DeleteInstanceRouteV2 } from '@rctf/types'
import { instanceHistoryContext } from '../../../../services/instance-history'
import { deleteInstance } from '../../../../services/instance-lifecycle'
import integrationsGroup from '../group'

integrationsGroup.route(DeleteInstanceRouteV2, ({ ctx, res, params, user }) =>
  deleteInstance({
    res,
    db: ctx.var.db,
    user,
    challengeId: params.id,
    history: instanceHistoryContext(ctx.var),
  })
)
