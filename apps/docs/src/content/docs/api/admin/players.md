---
title: "`<route>GET</route>` List players"
description: "`<route>GET /api/v2/admin/players</route>`"
order: 14
---

:::aside

::::route-example{def="GetAdminPlayersRouteV2"}

```json query
{
  "limit": 50,
  "offset": 0,
  "search": "nelly",
  "roles": "captain,member"
}
```

::::

:::

::route-meta{def="GetAdminPlayersRouteV2"}

This route lists player accounts (Discord sign-ins) for the admin panel, newest first. The search matches Discord username, display name, team name, or an exact Discord ID. `roles` limits the list to captains, members, or players without a team.

::request-body{def="GetAdminPlayersRouteV2" source="query" title="Query parameters"}

::response-body{def="GetAdminPlayersRouteV2" response="goodAdminPlayers" title="Response fields"}
