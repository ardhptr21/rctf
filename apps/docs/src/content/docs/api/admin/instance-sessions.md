---
title: "`<route>GET</route>` Instance connections"
description: "`<route>GET /api/v2/admin/instances/:id/sessions</route>`"
order: 44
---

:::aside

::::route-example{def="GetAdminInstanceSessionsRouteV2"}

```json params
{
  "id": "instance-id"
}
```

```json query
{
  "limit": 25,
  "offset": 0
}
```

::::

:::

::route-meta{def="GetAdminInstanceSessionsRouteV2"}

The TCP connections to an instance's `tcp-ssl` endpoints, newest first, from the Docker instancer's [logging proxy](/integrations/instancer/request-logs/#tcp-connections). Each comes with the start of what was sent each way. Only the newest `instanceRequestLogs.maxSessionsPerInstance` connections are kept.

::request-body{def="GetAdminInstanceSessionsRouteV2" source="params" title="Path parameters"}

::request-body{def="GetAdminInstanceSessionsRouteV2" source="query" title="Query parameters"}

::response-body{def="GetAdminInstanceSessionsRouteV2" response="goodAdminInstanceSessions" title="Response fields"}
