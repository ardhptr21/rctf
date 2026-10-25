import {
  GetAdminIntegrityCaseRouteV2,
  GetAdminIntegrityCasesRouteV2,
  UpdateAdminIntegrityCaseRouteV2,
} from '@rctf/types'
import {
  getCaseDetail,
  listCases,
  setCaseStatus,
} from '../../../../services/integrity/cases'
import adminGroup from '../group'

adminGroup.route(GetAdminIntegrityCasesRouteV2, async ({ ctx, res, query }) =>
  res.goodAdminIntegrityCases(await listCases(ctx.var.db, query))
)

adminGroup.route(GetAdminIntegrityCaseRouteV2, async ({ ctx, res, params }) => {
  const detail = await getCaseDetail(ctx.var.db, params.id)
  return detail
    ? res.goodAdminIntegrityCase(detail)
    : res.badIntegrityCaseNotFound()
})

adminGroup.route(
  UpdateAdminIntegrityCaseRouteV2,
  async ({ ctx, res, params, body, user }) => {
    const updated = await setCaseStatus(ctx.var.db, params.id, {
      status: body.status,
      note: body.note,
      adminTeamId: user.id,
    })
    return updated
      ? res.goodAdminIntegrityCaseUpdate()
      : res.badIntegrityCaseNotFound()
  }
)
