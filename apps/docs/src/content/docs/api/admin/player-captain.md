---
title: "`<route>POST</route>` Make player captain"
description: "`<route>POST /api/v2/admin/players/:id/captain</route>`"
order: 14
---

:::aside

::::route-example{def="MakeAdminPlayerCaptainRouteV2"}

```json params
{
  "id": "player-id"
}
```

::::

:::

::route-meta{def="MakeAdminPlayerCaptainRouteV2"}

This route makes a player the captain of their team. The previous captain stays on the team as a member.

::request-body{def="MakeAdminPlayerCaptainRouteV2" source="params" title="Path parameters"}

::response-body{def="MakeAdminPlayerCaptainRouteV2" response="goodAdminPlayerUpdate" title="Response fields"}
