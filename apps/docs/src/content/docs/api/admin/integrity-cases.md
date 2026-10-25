---
title: "`<route>GET</route>` List integrity cases"
description: "`<route>GET /api/v2/admin/integrity/cases</route>`"
order: 30
---

:::aside

::::route-example{def="GetAdminIntegrityCasesRouteV2"}

```json query
{
  "status": "open",
  "limit": 50,
  "offset": 0
}
```

::::

:::

::route-meta{def="GetAdminIntegrityCasesRouteV2"}

This route lists [cheat detection](/admin/integrity/) cases with one status, highest risk score first.

::request-body{def="GetAdminIntegrityCasesRouteV2" source="query" title="Query parameters"}

::response-body{def="GetAdminIntegrityCasesRouteV2" response="goodAdminIntegrityCases" title="Response fields"}
