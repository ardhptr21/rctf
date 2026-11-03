---
title: "`<route>POST</route>` Ingest instance requests"
description: "`<route>POST /api/v2/integrations/instance-requests</route>`"
order: 20
---

:::aside

::::route-example{def="IngestInstanceRequestsRouteV2" extra="BadJson,BadBody"}

```json body
{
  "entries": [
    {
      "StartUTC": "2026-05-05T10:00:00.123Z",
      "ClientHost": "203.0.113.42",
      "RequestHost": "web-3f9c1a.inst.example.com",
      "RequestMethod": "GET",
      "RequestPath": "/notes?id=1",
      "DownstreamStatus": 200,
      "DownstreamContentSize": 512,
      "Duration": 12500000,
      "request_User-Agent": "curl/8.5.0"
    }
  ]
}
```

::::

:::

::route-meta{def="IngestInstanceRequestsRouteV2"}

Receives batches of the instancer's Traefik JSON access log, sent by a log shipper such as Vector. See [Request logs](/integrations/instancer/request-logs/). It needs `Authorization: Bearer <instanceRequestLogs.token>`, and doesn't exist while no token is configured.

Each entry is matched to the instance it reached, by its hostname and its time, and stored. Entries that didn't reach a recorded instance are counted as unmatched: unknown hosts, admin teams' instances, times outside an instance's lifetime, or requests Traefik answered itself because no route matched (they have no `RouterName`). Lines that aren't HTTP access log entries are counted as invalid. Other Traefik fields are ignored.

::request-body{def="IngestInstanceRequestsRouteV2" title="Request body"}

::response-body{def="IngestInstanceRequestsRouteV2" response="goodInstanceRequestsIngest" title="Response fields"}
