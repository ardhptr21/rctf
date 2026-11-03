---
title: Instance history
description: Seeing every challenge instance teams started, and how each one ended.
order: 5
---

**Admin → Instances** lists every challenge instance a team has started, newest first. Each instance is one entry, kept from the moment it starts until it ends. If a team started three instances, you see three entries.

## What each entry shows

- **Started**: when the instance was started, with the time since the CTF began.
- **Team**, and the player who clicked **Start**. Instances started with a team token have no player.
- **Challenge**, with its category.
- **Status**: one of these.
  - **Running**: the instance is still up.
  - **Stopped**: the team stopped it.
  - **Solved**: stopped automatically when the team solved the challenge.
  - **Expired**: its time ran out.
  - **Gone**: the instancer no longer had it, for example because it crashed or was removed by hand.
  - **Errored**: the instancer reported an error.
- **Ended**, and **Lifetime**: how long it ran, or how long it has run so far.
- **Extends**: how many times the team extended it.
- **Requests**: how many HTTP requests reached it, once [request logs](/integrations/instancer/request-logs/) are set up.
- **Endpoint**: the hostname and port it was reachable on. Hover to see every endpoint.
- **IP**: the address it was started from.

Search by team or player name, filter by status, and click a category in the summary row to show only that category. The summary also counts the matching instances and teams.

A team's admin profile has an **Instances** tab with the same history for just that team. **Open in Instances** shows it on the full page.

## Requests

Click an instance to open its details: who started it, when, its endpoints, and the HTTP requests that reached it. This needs [request logs](/integrations/instancer/request-logs/) to be set up.

- **The summary** counts every request, the client IPs, and the responses by status class (2xx, 3xx, 4xx, 5xx).
- **The requests** are listed newest first, with the time, client IP, method, path with its query string, status, response size and time taken. Hover a row to see its user agent. Filter by path, by status class, or click an IP to show only its requests.
- **Each instance keeps its newest 2,000 requests** by default (`instanceRequestLogs.maxPerInstance`). The total still counts every one, and the details say when older requests were dropped.
- **Requests arrive a few seconds late**, since they're sent in batches.
- **Only HTTP and HTTPS requests** are recorded. Instances reachable only over TCP say so.

The detail view has its own link (`?instance=<id>`), so you can share it. A team profile's **Instances** tab opens the same details from each entry's request count.

## How endings are known

The instancer doesn't tell rCTF when an instance stops, so rCTF works it out:

- **Stopping and extending** are recorded when the team does them.
- **Solving** the challenge stops the team's instance straight away, since it isn't needed any more, and records it as **Solved**. Admin teams keep theirs, since they solve challenges to test them.
- **Expiry** comes from the time left that the instancer reports. Once that time passes, the entry shows as **Expired**, even if nobody looks at the challenge again.
- **An instance that dies early**, for example a crash, shows as **Gone** the next time its status is checked. The challenge page checks while a team has it open. Until then, the entry still shows **Running**.

Starting an instance that is already running returns the same instance, so it doesn't add an entry.

Admin teams' own test instances aren't recorded, the same way they're left out of [scoring](/admin/teams/#admin-teams-dont-score) and [cheat detection](/admin/integrity/).
