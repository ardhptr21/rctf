---
title: "`<route>PUT</route>` Ban player"
description: "`<route>PUT /api/v2/admin/players/:id/ban</route>`"
order: 14
---

:::aside

::::route-example{def="SetAdminPlayerBannedRouteV2"}

```json params
{
  "id": "player-id"
}
```

```json body
{
  "banned": true
}
```

::::

:::

::route-meta{def="SetAdminPlayerBannedRouteV2"}

This route bans or unbans a player. A banned player's existing sessions stop working at once, and signing in with the same Discord account returns `<response>403 badPlayerBanned</response>` until they are unbanned. The ban doesn't touch their team: they stay a member, and the team's solves and score are unchanged. Use [Update team](/api/admin/team-update/) to ban the team itself.

::request-body{def="SetAdminPlayerBannedRouteV2" source="params" title="Path parameters"}

::request-body{def="SetAdminPlayerBannedRouteV2" title="Request body"}

::response-body{def="SetAdminPlayerBannedRouteV2" response="goodAdminPlayerUpdate" title="Response fields"}
