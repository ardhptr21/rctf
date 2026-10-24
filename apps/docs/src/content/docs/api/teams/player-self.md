---
title: "`<route>GET</route>` Current player"
description: "`<route>GET /api/v2/players/me</route>`"
order: 1
---

:::aside

::route-example{def="GetPlayerSelfRouteV2"}

:::

::route-meta{def="GetPlayerSelfRouteV2"}

Returns the signed-in Discord player, their team if they have one, the team size limit, and whether rosters are locked because the CTF has started. It requires a player token from [Discord login](/api/auth/discord/).

::response-body{def="GetPlayerSelfRouteV2" response="goodPlayerSelf" title="Response fields"}
