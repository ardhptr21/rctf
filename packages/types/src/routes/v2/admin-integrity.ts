import { z } from 'zod/mini'
import { IntegrityCaseStatus } from '../../enums/integrity'
import { Permissions } from '../../enums/permissions'
import { defineRoute } from '../../internal'
import {
  BadBody,
  BadIntegrityCaseNotFound,
  BadPerms,
  BadToken,
  GoodAdminIntegrityCase,
  GoodAdminIntegrityCases,
  GoodAdminIntegrityCaseUpdate,
} from '../../responses'
import { example } from '../../util/example'

// the same access as the Submissions page, whose data cases point into
const INTEGRITY_PERMISSIONS = Permissions.usersWrite | Permissions.challsRead

const CaseParams = z.object({
  id: example(z.string(), 'case-1a2b3c').check(z.describe('Case ID.')),
})

export const GetAdminIntegrityCasesRouteV2 = defineRoute({
  path: '/v2/admin/integrity/cases',
  method: 'GET',
  query: z.object({
    status: example(z.enum(IntegrityCaseStatus), 'open').check(
      z.describe('Which cases to list.')
    ),
    limit: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(1))
      .check(z.lte(100))
      .check(z.describe('Integer `1`-`100`. Page size.')),
    offset: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(0))
      .check(z.describe('Integer `>= 0`. Page offset.')),
  }),
  goodResponses: [GoodAdminIntegrityCases],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: INTEGRITY_PERMISSIONS,
})

export const GetAdminIntegrityCaseRouteV2 = defineRoute({
  path: '/v2/admin/integrity/cases/:id',
  method: 'GET',
  params: CaseParams,
  goodResponses: [GoodAdminIntegrityCase],
  badResponses: [BadBody, BadIntegrityCaseNotFound, BadPerms, BadToken],
  authRequired: true,
  permissions: INTEGRITY_PERMISSIONS,
})

export const UpdateAdminIntegrityCaseRouteV2 = defineRoute({
  path: '/v2/admin/integrity/cases/:id',
  method: 'PUT',
  params: CaseParams,
  body: z.object({
    status: example(z.enum(IntegrityCaseStatus), 'dismissed').check(
      z.describe('`dismissed`, `actioned`, or `open` to reopen.')
    ),
    note: example(
      z.optional(z.string().check(z.maxLength(2000))),
      'Same university network; checked with the organizers.'
    ).check(z.describe('Reviewer note. Leave out to keep the current one.')),
  }),
  goodResponses: [GoodAdminIntegrityCaseUpdate],
  badResponses: [BadBody, BadIntegrityCaseNotFound, BadPerms, BadToken],
  authRequired: true,
  permissions: INTEGRITY_PERMISSIONS,
})
