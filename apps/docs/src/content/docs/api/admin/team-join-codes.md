---
title: "`<route>POST</route>` Export team join codes"
description: "`<route>POST /api/v2/admin/users/join-codes</route>`"
order: 40
---

:::aside

::::route-example{def="ExportAdminTeamJoinCodesRouteV2" extra="BadJson,BadBody"}

```json body
{
  "division": {
    "include": ["open"]
  }
}
```

```json query
{
  "sortBy": "team",
  "sortOrder": "asc"
}
```

::::

:::

::route-meta{def="ExportAdminTeamJoinCodesRouteV2"}

Returns the join code of every team that matches the filters, unpaged, in the requested order. The filters and sort are the same as [Filter teams](/api/admin/team-filter/), without `limit` and `offset`. Teams registered by email have no join code, so their `joinToken` is `null`.

One request returns at most 10,000 teams. Above that, it returns `badExportTooLarge` with the matching total.

::request-body{def="ExportAdminTeamJoinCodesRouteV2" source="query" title="Query parameters"}

::request-body{def="ExportAdminTeamJoinCodesRouteV2" title="Request body"}

::response-body{def="ExportAdminTeamJoinCodesRouteV2" response="goodAdminTeamJoinCodes" title="Response fields"}
