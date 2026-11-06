---
title: Request logs
description: Recording the HTTP requests and TCP connections that reach challenge instances.
order: 3
---

rCTF can record every HTTP request that reaches a team's instance, and show the requests on each instance in [Admin → Instances](/admin/instances/#requests). The requests come from the instancer's Traefik, which already routes all instance traffic:

1. **Traefik** writes a JSON access log line for each HTTP request. Among the headers, only `User-Agent` is kept, so cookies and authorization headers are never logged.
2. **[Vector](https://vector.dev)** reads Traefik's logs and sends them to rCTF in batches, with a shared token.
3. **rCTF** matches each request to the instance it reached, by hostname and time, and stores it.

The Docker instancer also records [TCP connections](#tcp-connections) to `tcp-ssl` endpoints, with the start of what was sent each way. The Kubernetes instancer records HTTP requests only.

## rCTF

Set a token of at least 16 characters, and use the same token in the Vector setup below:

```yaml
instanceRequestLogs:
  token: a-long-random-secret
  maxRequestsPerInstance: 2000
  maxSessionsPerInstance: 500
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `<red>instanceRequestLogs.token</red>` | `string{:ts}` | | Bearer token Vector sends. Without it, the ingest routes don't exist |
| `<red>instanceRequestLogs.maxRequestsPerInstance</red>` | `number{:ts}` | `2000{:ts}` | Requests kept per instance. Older ones are dropped, but still counted in the instance's total |
| `<red>instanceRequestLogs.maxSessionsPerInstance</red>` | `number{:ts}` | `500{:ts}` | TCP connections kept per instance. Older ones are dropped, but still counted |

## Docker instancer

`deploy/docker-instancer` already has everything:

- `conf/traefik.yml` turns on the JSON access log.
- `compose.yml` runs a `vector` service with `conf/vector.yaml`.

Add these to the instancer's `.env`:

```bash
RCTF_URL=https://ctf.example.com
RCTF_INSTANCE_REQUEST_LOGS_TOKEN=a-long-random-secret
```

`RCTF_URL` must be reachable from the instancer host. Vector is on the same `rctf_network` as rCTF, so an internal address works too.

## TCP connections

Traefik keeps no log for TCP routes, so the Docker instancer puts a small logging proxy, **tcplog**, in front of every `tcp-ssl` endpoint:

```
player --TLS--> Traefik :1337 --PROXY header + TCP--> tcplog --TCP--> challenge
```

- **Traefik still handles TLS**, so players connect exactly as before (`ncat --ssl host 1337`), and challenges need no changes.
- **Traefik passes on the player's address** in a PROXY protocol header, so connections show the player's IP rather than Traefik's. The challenge never sees the header.
- **One tcplog container runs per instance**, on that instance's own routing network, so it can only reach that instance. It starts and stops with the instance, has no capabilities and a read-only filesystem, and uses about 20 MB of memory.
- **For each connection, tcplog records** the client IP, when it opened, how long it lasted, the bytes each way, and the **first 16 KB in each direction**. It prints this as one JSON line, which Vector sends to rCTF. A long connection is also reported every 30 seconds while open, and once more when the instance stops.

Build the tcplog image once on the instancer host, and again after updates:

```bash
docker compose --profile build build tcplog
```

Without the image, the instancer logs a warning and routes TCP endpoints directly, as before.

Traefik sends the PROXY header through a TCP `serversTransport` named `tcplog`, defined in `conf/tcplog-transport.yml`. The compose file mounts it into Traefik's dynamic configuration. If you run your own Traefik, add the same file:

```yaml
tcp:
  serversTransports:
    tcplog:
      proxyProtocol:
        version: 2
```

Without that transport, Traefik can't route to the proxies and TCP endpoints stop working. These instancer settings change its behavior:

| Setting | Default | Description |
| --- | --- | --- |
| `TCPLOG_ENABLED` | `true` | `false` routes TCP endpoints directly, without logging |
| `TCPLOG_IMAGE` | `tiny-instancer-tcplog:latest` | The proxy's image |
| `TCPLOG_MAX_BYTES` | `16384` | Bytes of transcript kept per direction. rCTF keeps at most 64 KB |
| `TCPLOG_FLUSH_SECONDS` | `30` | How often an open connection is reported |
| `TCPLOG_MEM_LIMIT` | `32m` | The proxy's memory limit |
| `TCPLOG_SERVERS_TRANSPORT` | `tcplog@file` | The Traefik `serversTransport` that sends the PROXY header. Empty uses Traefik's older per-service setting, which Traefik 3 still accepts but marks deprecated |

The transcript is whatever players send, flags and exploits included. Like the rest of the admin panel, only admins can see it.

## Kubernetes instancer

The Terraform module in `deploy/terraform/instancer` turns on Traefik's JSON access log. Given a token, it also installs Vector, one pod per node, to read the Traefik pods' logs. Set the two variables:

```hcl
rctf_url = "https://ctf.example.com"
instance_request_logs_token = "a-long-random-secret"
```

Vector isn't installed while `instance_request_logs_token` is empty.

## Checking it works

Open an HTTP instance from a challenge page, load it in a browser, and wait a few seconds: Vector sends a batch every 5 seconds. The instance's entry in **Admin → Instances** then counts the requests. For a TCP instance, connect with `ncat --ssl <host> 1337`, send something, and disconnect. If nothing shows up:

- Check Vector's logs (`docker logs ti-vector`, or the Vector pods' logs). A `401` from rCTF means the tokens don't match. A `404` means rCTF has no `instanceRequestLogs.token`.
- The ingest response says how many entries were stored, unmatched (a hostname of no recorded instance, such as an admin team's) or invalid.
- For TCP, check that the instance has a `-tcplog` container (`docker ps | grep tcplog`). Without one, the image is missing or `TCPLOG_ENABLED` is off; the instancer's log says which. If connections show Traefik's IP instead of the player's, the PROXY header isn't arriving. If TCP endpoints don't answer at all, check Traefik's log for a missing `tcplog@file` serversTransport.
