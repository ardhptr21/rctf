---
title: "`<route>GET</route>` Live leaderboard"
description: "`<route>GET /api/v2/admin/leaderboard/live</route>`"
order: 21
---

:::aside

::route-example{def="GetAdminLiveLeaderboardRouteV2"}

:::

::route-meta{def="GetAdminLiveLeaderboardRouteV2"}

This route returns live standings that ignore the [scoreboard freeze](/admin/#scoreboard-freeze). While the scoreboard is frozen, the public leaderboard only counts solves made before the freeze time. This route computes the standings from every solve instead, so organizers can follow the real results.

Standings are recomputed on demand and cached for about 10 seconds. The response has the same shape as the [public leaderboard](/api/leaderboard/now/).

::request-body{def="GetAdminLiveLeaderboardRouteV2" source="query" title="Query parameters"}

::response-body{def="GetAdminLiveLeaderboardRouteV2" response="goodLeaderboardV2" title="Response fields"}
