---
title: "`<route>GET</route>` List team members"
description: "`<route>GET /api/v2/teams/me/members</route>`"
order: 4
---

:::aside

::route-example{def="GetTeamMembersRouteV2"}

:::

::route-meta{def="GetTeamMembersRouteV2"}

Lists the players on the caller's team in join order. Only the captain receives `joinToken`; other members get `null{:ts}`.

::response-body{def="GetTeamMembersRouteV2" response="goodTeamMembers" title="Response fields"}
