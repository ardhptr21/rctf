---
title: "`<route>GET</route>` Instance detail"
description: "`<route>GET /api/v2/admin/instances/:id</route>`"
order: 42
---

:::aside

::::route-example{def="GetAdminInstanceRouteV2"}

```json params
{
  "id": "instance-id"
}
```

::::

:::

::route-meta{def="GetAdminInstanceRouteV2"}

One entry of the [instance history](/admin/instances/), in the same shape as the list, with a summary of the HTTP requests that reached it.

::request-body{def="GetAdminInstanceRouteV2" source="params" title="Path parameters"}

::response-body{def="GetAdminInstanceRouteV2" response="goodAdminInstance" title="Response fields"}
