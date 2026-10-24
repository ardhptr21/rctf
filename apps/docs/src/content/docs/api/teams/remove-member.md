---
title: "`<route>DELETE</route>` Remove a member"
description: "`<route>DELETE /api/v2/teams/me/members/:playerId</route>`"
order: 6
---

:::aside

::route-example{def="RemoveTeamMemberRouteV2"}

:::

::route-meta{def="RemoveTeamMemberRouteV2"}

Lets the captain remove another player from the team. Like leaving, this is only allowed before the CTF starts.

::request-body{def="RemoveTeamMemberRouteV2" source="params" title="Path parameters"}

::response-body{def="RemoveTeamMemberRouteV2" response="goodTeamMemberRemove" title="Response fields"}
