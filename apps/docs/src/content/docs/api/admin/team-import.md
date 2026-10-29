---
title: "`<route>POST</route>` Import teams"
description: "`<route>POST /api/v2/admin/users/import</route>`"
order: 39
---

:::aside

::::route-example{def="ImportAdminTeamsRouteV2" extra="BadJson,BadBody"}

```json body
{
  "csv": "name,division
Null Pointer Pirates,college
Heap Hoppers,
",
  "confirm": false
}
```

::::

:::

::route-meta{def="ImportAdminTeamsRouteV2"}

Creates teams from a CSV file. The file has a header row with a `name` column and an optional `division` column, then one team per row. A blank division means the default division, and other columns are ignored. One file holds at most 1,000 teams.

With `confirm: false`, the file is only checked. The response lists the teams it would create and every problem, each with its line number. With `confirm: true`, the file is checked again. If there are no problems, every team is created in one transaction, each with a new join code. Otherwise `badTeamsImport` lists the problems and nothing is created.

Names follow the same rules as [creating a team](/api/teams/create/). They must be unique within the file and must not match an existing team, ignoring case.

::request-body{def="ImportAdminTeamsRouteV2" title="Request body"}

::response-body{def="ImportAdminTeamsRouteV2" response="goodAdminTeamsImportPreview" title="Preview response fields"}

::response-body{def="ImportAdminTeamsRouteV2" response="goodAdminTeamsImport" title="Import response fields"}
