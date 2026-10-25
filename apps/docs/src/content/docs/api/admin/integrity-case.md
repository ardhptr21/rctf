---
title: "`<route>GET</route>` Integrity case"
description: "`<route>GET /api/v2/admin/integrity/cases/:id</route>`"
order: 31
---

:::aside

::::route-example{def="GetAdminIntegrityCaseRouteV2"}

```json params
{
  "id": "case-id"
}
```

::::

:::

::route-meta{def="GetAdminIntegrityCaseRouteV2"}

This route returns one case with all its signals, newest first.

::request-body{def="GetAdminIntegrityCaseRouteV2" source="params" title="Path parameters"}

::response-body{def="GetAdminIntegrityCaseRouteV2" response="goodAdminIntegrityCase" title="Response fields"}
