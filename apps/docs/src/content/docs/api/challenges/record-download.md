---
title: "`<route>POST</route>` Record a download"
description: "`<route>POST /api/v2/challs/:id/downloads</route>`"
order: 20
---

:::aside

::::route-example{def="RecordChallengeDownloadRouteV2"}

```json params
{
  "id": "challenge-id"
}
```

```json body
{
  "url": "https://files.example/chall.zip"
}
```

::::

:::

::route-meta{def="RecordChallengeDownloadRouteV2"}

The challenge page calls this route when a team downloads an attachment, because the files themselves are served straight from the upload host. [Cheat detection](/admin/integrity/) uses it to flag solves without a download. Only URLs listed on the challenge are accepted, and each team's first download of each file is kept.

::request-body{def="RecordChallengeDownloadRouteV2" source="params" title="Path parameters"}

::request-body{def="RecordChallengeDownloadRouteV2" title="Request body"}

#### Response

A successful request returns `<response>200 goodChallengeDownload</response>` with no data.
