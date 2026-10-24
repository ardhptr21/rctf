---
title: "`<route>POST</route>` Leave the team"
description: "`<route>POST /api/v2/teams/me/leave</route>`"
order: 5
---

:::aside

::route-example{def="LeaveTeamRouteV2"}

:::

::route-meta{def="LeaveTeamRouteV2"}

Removes the caller from their team. Rosters lock when the CTF starts, after which this returns `<response>409 badRosterLocked</response>`.

If the captain leaves, the earliest-joined remaining member becomes captain. If the last player leaves a team that has no solves, the team is deleted and its name becomes available again.

::response-body{def="LeaveTeamRouteV2" response="goodTeamLeave" title="Response fields"}
