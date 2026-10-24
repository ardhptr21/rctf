---
title: "Teams"
description: "Discord player accounts, team creation, joining, and roster management."
order: 13
scroll: true
aside: true
---

:::aside

| Route | Endpoint |
| --- | --- |
| [Current player](/api/teams/player-self/) | `<route>GET /api/v2/players/me</route>` |
| [Create a team](/api/teams/create/) | `<route>POST /api/v2/teams</route>` |
| [Join a team](/api/teams/join/) | `<route>POST /api/v2/teams/join</route>` |
| [List team members](/api/teams/members/) | `<route>GET /api/v2/teams/me/members</route>` |
| [Leave the team](/api/teams/leave/) | `<route>POST /api/v2/teams/me/leave</route>` |
| [Remove a member](/api/teams/remove-member/) | `<route>DELETE /api/v2/teams/me/members/:playerId</route>` |
| [Transfer captaincy](/api/teams/captain/) | `<route>POST /api/v2/teams/me/captain</route>` |
| [Rotate the join token](/api/teams/token/) | `<route>POST /api/v2/teams/me/token</route>` |

:::

When [Discord login](/configuration/#discord-login) is configured, each participant has their own player account and teams are formed by players. These routes take a player token from [Discord login](/api/auth/discord/). The player does not need to be on a team.

Until a player is on a team, the challenge routes (list and solvers) return `<response>403 badNoTeam</response>`, even when the challenges page is public. Once a player is on a team, their token also works on every route that acts for a team, such as flag submission and profile updates. Profile updates (`<route>PATCH /api/v2/users/me</route>` and the avatar route) are limited to the captain.

Rosters lock when the CTF starts: after that, players can still join teams that have room, but nobody can leave or be removed.
