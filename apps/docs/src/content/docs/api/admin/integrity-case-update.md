---
title: "`<route>PUT</route>` Update integrity case"
description: "`<route>PUT /api/v2/admin/integrity/cases/:id</route>`"
order: 32
---

:::aside

::::route-example{def="UpdateAdminIntegrityCaseRouteV2"}

```json params
{
  "id": "case-id"
}
```

```json body
{
  "status": "dismissed",
  "note": "Same campus network."
}
```

::::

:::

::route-meta{def="UpdateAdminIntegrityCaseRouteV2"}

This route dismisses a case, marks it actioned, or reopens it. Banning a team is a separate step, through [Update team](/api/admin/team-update/).

::request-body{def="UpdateAdminIntegrityCaseRouteV2" source="params" title="Path parameters"}

::request-body{def="UpdateAdminIntegrityCaseRouteV2" title="Request body"}

#### Response

A successful request returns `<response>200 goodAdminIntegrityCaseUpdate</response>` with no data.
