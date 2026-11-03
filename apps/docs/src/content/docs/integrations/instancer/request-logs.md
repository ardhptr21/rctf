---
title: Request logs
description: Recording the HTTP requests that reach challenge instances.
order: 3
---

rCTF can record every HTTP request that reaches a team's instance, and show the requests on each instance in [Admin → Instances](/admin/instances/#requests). The requests come from the instancer's Traefik, which already routes all instance traffic:

1. **Traefik** writes a JSON access log line for each HTTP request. Among the headers, only `User-Agent` is kept, so cookies and authorization headers are never logged.
2. **[Vector](https://vector.dev)** reads Traefik's logs and sends them to rCTF in batches, with a shared token.
3. **rCTF** matches each request to the instance it reached, by hostname and time, and stores it.

Only HTTP and HTTPS instances are covered. TCP connections aren't logged yet.

## rCTF

Set a token of at least 16 characters, and use the same token in the Vector setup below:

```yaml
instanceRequestLogs:
  token: a-long-random-secret
  maxPerInstance: 2000
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `<red>instanceRequestLogs.token</red>` | `string{:ts}` | | Bearer token Vector sends. Without it, the ingest route doesn't exist |
| `<red>instanceRequestLogs.maxPerInstance</red>` | `number{:ts}` | `2000{:ts}` | Requests kept per instance. Older ones are dropped, but still counted in the instance's total |

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

## Kubernetes instancer

The Terraform module in `deploy/terraform/instancer` turns on Traefik's JSON access log. Given a token, it also installs Vector, one pod per node, to read the Traefik pods' logs. Set the two variables:

```hcl
rctf_url = "https://ctf.example.com"
instance_request_logs_token = "a-long-random-secret"
```

Vector isn't installed while `instance_request_logs_token` is empty.

## Checking it works

Open an HTTP instance from a challenge page, load it in a browser, and wait a few seconds: Vector sends a batch every 5 seconds. The instance's entry in **Admin → Instances** then counts the requests. If it doesn't:

- Check Vector's logs (`docker logs ti-vector`, or the Vector pods' logs). A `401` from rCTF means the tokens don't match. A `404` means rCTF has no `instanceRequestLogs.token`.
- The ingest response says how many entries were stored, unmatched (a hostname of no recorded instance, such as an admin team's) or invalid.
