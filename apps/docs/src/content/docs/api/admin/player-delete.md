---
title: "`<route>DELETE</route>` Delete player"
description: "`<route>DELETE /api/v2/admin/players/:id</route>`"
order: 14
---

:::aside

::::route-example{def="DeleteAdminPlayerRouteV2"}

```json params
{
  "id": "player-id"
}
```

::::

:::

::route-meta{def="DeleteAdminPlayerRouteV2"}

This route deletes a player account and signs it out. Their team keeps its solves, and if they were captain, the longest-serving remaining member takes over. Signing in with Discord again creates a new account with no team. A banned player can't be deleted, since that would lift the ban: the route returns `<response>403 badPlayerBanned</response>` until they are unbanned.

::request-body{def="DeleteAdminPlayerRouteV2" source="params" title="Path parameters"}

#### Response

A successful request returns `<response>200 goodAdminPlayerDelete</response>` with no data.
