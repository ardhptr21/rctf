---
title: "`<route>POST</route>` Ingest instance connections"
description: "`<route>POST /api/v2/integrations/instance-sessions</route>`"
order: 21
---

:::aside

::::route-example{def="IngestInstanceSessionsRouteV2" extra="BadJson,BadBody"}

```json body
{
  "entries": [
    {
      "kind": "tcp-session",
      "id": "5f2c0e1a9b8d4c3e",
      "host": "pwn-3f9c1a.inst.example.com",
      "clientIp": "203.0.113.42",
      "startedAt": "2026-05-05T10:00:00.123+00:00",
      "durationMs": 8400,
      "bytesIn": 5,
      "bytesOut": 6,
      "truncated": false,
      "open": false,
      "error": null,
      "transcript": [
        { "dir": "out", "t": 0, "data": "aGVsbG8K" },
        { "dir": "in", "t": 1200, "data": "ZmxhZwo=" }
      ]
    }
  ]
}
```

::::

:::

::route-meta{def="IngestInstanceSessionsRouteV2"}

Receives batches of connection records from the Docker instancer's tcplog proxy, sent by Vector. See [TCP connections](/integrations/instancer/request-logs/#tcp-connections). It needs `Authorization: Bearer <instanceRequestLogs.token>`, and doesn't exist while no token is configured.

Each record is matched to the instance it reached, by its hostname and when it opened. The proxy reports a long connection several times under the same `id`; a later report replaces the stored one, and the connection is counted once. Records that didn't reach a recorded instance are counted as unmatched, and anything that isn't a valid record as invalid. Transcript past 64 KB in either direction is dropped and the connection marked truncated.

| Field | Description |
| --- | --- |
| `kind` | Always `tcp-session` |
| `id` | The proxy's ID for the connection: letters, digits, `-` and `_` |
| `host` | The hostname the player connected to |
| `clientIp` | The player's IP address |
| `startedAt` | When it opened, as an ISO 8601 time |
| `durationMs` | How long it lasted, or has lasted so far |
| `bytesIn`, `bytesOut` | Bytes the player sent, and the challenge sent back |
| `truncated` | Whether the transcript stops early |
| `open` | Whether it was still open when reported |
| `error` | Why it ended abnormally, or `null` |
| `transcript` | Chunks in order: `dir` (`in` from the player, `out` from the challenge), `t` (milliseconds after it opened) and `data` (base64) |

::request-body{def="IngestInstanceSessionsRouteV2" title="Request body"}

::response-body{def="IngestInstanceSessionsRouteV2" response="goodInstanceSessionsIngest" title="Response fields"}
