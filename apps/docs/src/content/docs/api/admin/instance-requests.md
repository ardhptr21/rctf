---
title: "`<route>GET</route>` Instance requests"
description: "`<route>GET /api/v2/admin/instances/:id/requests</route>`"
order: 43
---

:::aside

::::route-example{def="GetAdminInstanceRequestsRouteV2"}

```json params
{
  "id": "instance-id"
}
```

```json query
{
  "limit": 100,
  "offset": 0,
  "statusClass": 4
}
```

::::

:::

::route-meta{def="GetAdminInstanceRequestsRouteV2"}

The HTTP requests that reached an instance, newest first, from its [request logs](/integrations/instancer/request-logs/). Only the newest `instanceRequestLogs.maxRequestsPerInstance` requests are kept.

::request-body{def="GetAdminInstanceRequestsRouteV2" source="params" title="Path parameters"}

::request-body{def="GetAdminInstanceRequestsRouteV2" source="query" title="Query parameters"}

::response-body{def="GetAdminInstanceRequestsRouteV2" response="goodAdminInstanceRequests" title="Response fields"}
