---
title: "`<route>POST</route>` Export submissions"
description: "`<route>POST /api/v2/admin/submissions/export</route>`"
order: 38
---

:::aside

::::route-example{def="ExportAdminSubmissionsRouteV2" extra="BadJson,BadBody"}

```json body
{
  "result": {
    "include": [
      "correct",
      "cheated"
    ]
  },
  "createdAfter": "2026-05-05T09:30:00.000Z"
}
```

```json query
{
  "sortBy": "createdAt",
  "sortOrder": "desc"
}
```

::::

:::

::route-meta{def="ExportAdminSubmissionsRouteV2"}

Exports every submission audit row that matches the filters as an Excel (`.xlsx`) file. The file is returned base64-encoded. It takes the same query and body as [Filter submissions](/api/admin/submission-filter/), minus `limit` and `offset`.

The workbook starts with a **Summary** sheet: the CTF name, the export time, the sort, the applied filters, and per-challenge counts. Next comes one sheet per challenge, ordered by category and then name. Within each sheet, rows keep the requested sort.

One export holds at most 50,000 submissions. A larger result returns `badExportTooLarge` with the matching total, so narrow the filters and try again.

::request-body{def="ExportAdminSubmissionsRouteV2" source="query" title="Query parameters"}

::request-body{def="ExportAdminSubmissionsRouteV2" title="Request body"}

::response-body{def="ExportAdminSubmissionsRouteV2" response="goodAdminSubmissionsExport" title="Response fields"}
