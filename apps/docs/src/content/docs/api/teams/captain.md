---
title: "`<route>POST</route>` Transfer captaincy"
description: "`<route>POST /api/v2/teams/me/captain</route>`"
order: 7
---

:::aside

::route-example{def="TransferTeamCaptainRouteV2"}

:::

::route-meta{def="TransferTeamCaptainRouteV2"}

Makes another member of the team its captain. The caller stops being captain.

::request-body{def="TransferTeamCaptainRouteV2" title="Request body"}

::response-body{def="TransferTeamCaptainRouteV2" response="goodTeamCaptainTransfer" title="Response fields"}
