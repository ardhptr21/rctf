---
title: "`<route>POST</route>` Instance history"
description: "`<route>POST /api/v2/admin/instances</route>`"
order: 41
---

:::aside

::::route-example{def="FilterAdminInstancesRouteV2" extra="BadJson,BadBody"}

```json body
{
  "category": {
    "include": ["web"]
  },
  "status": {
    "include": ["expired", "gone"]
  }
}
```

```json query
{
  "limit": 50,
  "offset": 0
}
```

::::

:::

::route-meta{def="FilterAdminInstancesRouteV2"}

Lists the [instance history](/admin/instances/), newest first. There is one entry per instance a team started, with its status, its times and where it was reachable. The response also counts the matching instances and teams, and the matching instances per category. Those counts cover all pages, not just this one.

The status of an entry left running past its expiry is `expired`, with `endedAt` set to its expiry time.

::request-body{def="FilterAdminInstancesRouteV2" source="query" title="Query parameters"}

::request-body{def="FilterAdminInstancesRouteV2" title="Request body"}

::response-body{def="FilterAdminInstancesRouteV2" response="goodAdminInstances" title="Response fields"}
