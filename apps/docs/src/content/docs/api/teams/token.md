---
title: "`<route>POST</route>` Rotate the join token"
description: "`<route>POST /api/v2/teams/me/token</route>`"
order: 8
---

:::aside

::route-example{def="RotateTeamTokenRouteV2"}

:::

::route-meta{def="RotateTeamTokenRouteV2"}

Replaces the team's join token. The old token stops working immediately; existing members are not affected. Captain only.

::response-body{def="RotateTeamTokenRouteV2" response="goodTeamTokenRotate" title="Response fields"}
