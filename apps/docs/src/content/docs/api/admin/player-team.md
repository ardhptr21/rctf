---
title: "`<route>PUT</route>` Set player team"
description: "`<route>PUT /api/v2/admin/players/:id/team</route>`"
order: 14
---

:::aside

::::route-example{def="SetAdminPlayerTeamRouteV2"}

```json params
{
  "id": "player-id"
}
```

```json body
{
  "teamId": "team-id"
}
```

::::

:::

::route-meta{def="SetAdminPlayerTeamRouteV2"}

This route moves a player to another team, or removes them from their team when `teamId` is `null`. Unlike the player routes, it works after the CTF has started.

- The target team must exist, must not be banned, and must have room under the team size limit.
- A player moved into an empty team becomes its captain.
- When a captain leaves, the longest-serving remaining member becomes captain.
- Solves belong to the team, so they stay with the old team. An emptied team is kept.

::request-body{def="SetAdminPlayerTeamRouteV2" source="params" title="Path parameters"}

::request-body{def="SetAdminPlayerTeamRouteV2" title="Request body"}

::response-body{def="SetAdminPlayerTeamRouteV2" response="goodAdminPlayerUpdate" title="Response fields"}
