---
title: "`<route>POST</route>` Log in with Discord"
description: "`<route>POST /api/v2/auth/discord</route>`"
order: 6
---

:::aside

::route-example{def="DiscordLoginRouteV2"}

:::

::route-meta{def="DiscordLoginRouteV2"}

Exchanges the authorization code Discord sends to `<origin>/login/discord` for a player auth token. The route is only available when [Discord login](/configuration/#discord-login) is configured.

The server exchanges the code with Discord, reads the player's profile, and creates the player on first login. Later logins refresh the stored username, display name and avatar. When `discord.requiredGuildId` is set, accounts that are not members of that server get `<response>403 badDiscordGuild</response>`.

`redirectUri` must equal `<origin>/login/discord`, the URI used in the authorization request. The returned token identifies the player, not a team. A player without a team can use the [team routes](/api/teams/) but gets `<response>403 badNoTeam</response>` from routes that act for a team, such as flag submission.

::request-body{def="DiscordLoginRouteV2" title="Request body"}

::response-body{def="DiscordLoginRouteV2" response="goodDiscordLogin" title="Response fields"}
