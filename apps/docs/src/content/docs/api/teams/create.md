---
title: "`<route>POST</route>` Create a team"
description: "`<route>POST /api/v2/teams</route>`"
order: 2
---

:::aside

::route-example{def="CreateTeamRouteV2"}

:::

::route-meta{def="CreateTeamRouteV2"}

Creates a team for a player who is not on one, and makes them its captain. When admins have turned team creation off, this returns `<response>403 badTeamCreationClosed</response>` and players can only [join](/api/teams/join/) existing teams. Team names are unique. `division` defaults to the configured default division.

::request-body{def="CreateTeamRouteV2" title="Request body"}

::response-body{def="CreateTeamRouteV2" response="goodTeamCreate" title="Response fields"}
