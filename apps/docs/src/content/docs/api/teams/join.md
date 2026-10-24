---
title: "`<route>POST</route>` Join a team"
description: "`<route>POST /api/v2/teams/join</route>`"
order: 3
---

:::aside

::route-example{def="JoinTeamRouteV2"}

:::

::route-meta{def="JoinTeamRouteV2"}

Adds the player to the team that owns the join token. Teams are limited to `maxTeamSize` players, except teams with admin permissions, which are unlimited. Joining is allowed until the CTF ends.

::request-body{def="JoinTeamRouteV2" title="Request body"}

::response-body{def="JoinTeamRouteV2" response="goodTeamJoin" title="Response fields"}
