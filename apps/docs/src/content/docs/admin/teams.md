---
title: Teams
description: Managing teams and users in rCTF.
order: 3
---

rCTF uses a team-based model where each team shares one login token. The admin panel gives you tools for viewing, searching, and managing teams.

## Players and teams

When [Discord login](/configuration#discord-login) is configured, each participant has their own player account:

1. A player logs in with Discord.
2. They create a team, which makes them its **captain**, or join an existing team with its **team token**.
3. The captain shares the team token (shown on the **Team** page) with teammates and can rotate it at any time.

Admins can stop new teams from being created with **Admin → Settings → Teams** (or `<red>teamCreationEnabled</red>` in the config). While it is off, the create form is hidden and players can only join an existing team with its token.

Teams are limited to **Max team members** players, set in **Admin → Settings → Teams** (the default comes from `<red>maxTeamSize</red>` in the config). Teams with admin permissions have no limit, so all organizers can share one team. Lowering the limit does not remove anyone: teams that are already over it keep their members but cannot take new ones.

The captain can rename the team, change its division and avatar, remove members, and hand captaincy to another member. Members can leave on their own. Rosters lock when the CTF starts: after that nobody can leave or be removed, but players can still join teams that have room. If a captain leaves, the earliest-joined member becomes captain. A team whose last player leaves before it has any solves is deleted.

Solves, scores and ranks belong to the team, exactly as before. The admin team detail page lists the team's players.

### Making the first admin

Admin permissions belong to teams. The quickest way to bootstrap one is to create the admin team from the server with your Discord user ID:

```ansi
$ <red><dim>bun</dim> rctf</red> user create-admin organizers <dim>--discord-id</dim> <your discord id>
```

Log in with Discord and you are the captain of `organizers`. Share the printed team token with other organizers so they can join. Every player on that team has admin access.

To make an existing team an admin team instead, run `rctf user promote <team name>` (a team email or a member's Discord ID also works). See the [CLI reference](/admin/cli/) for both commands.

### Admin teams don't score

A team with any admin permission takes no part in scoring. Its members can submit flags to test challenges, and they still see their own solves, but those solves never count:

- The team has no score or rank and doesn't appear on the scoreboard, the graph or the CTFtime feed.
- Its solves don't lower decaying challenge points, don't add to solve counts and never take a first blood.
- Players don't see the team in solver lists, and its profile is hidden from everyone except its own members and other admins. Admin pages still list its solves.

Promoting or demoting a team recalculates points and the standings right away, the same way a ban does.

### Managing players

**Manage players** in the admin menu (`/admin/players`) lists every player who has signed in with Discord, newest first. You can search by Discord username, display name, Discord ID or team name, and filter by role (captain, member, or no team) and by status (active or banned). Each row shows the player's team, when they joined it and when they first signed in.

From a player's row you can:

- **Make captain** of their current team. The old captain stays on as a member.
- **Move to another team**, or **add to a team** if they have none. The target team must not be banned and must have room under **Max team members**. A player moved into an empty team becomes its captain.
- **Remove from team.** If they were captain, the earliest-joined member takes over.
- **Ban the player.** They are signed out straight away and can't sign in again with that Discord account until you unban them. A ban is about the person: they stay on their team, and the team's solves and score are untouched. Ban the team as well if it should leave the standings.
- **Delete the player.** This signs them out and removes the account. Signing in with Discord again starts a new account with no team. Banned players can't be deleted, because deleting the account would also lift the ban: unban them first.

These actions work at any time, including after rosters lock when the CTF starts. Solves belong to the team, so a player who moves leaves their team's solves behind. A team emptied this way is kept rather than deleted, so you can delete it from the teams list if you want to.

## Listing and searching teams

The admin panel lets you browse all registered teams with their scores, paginate through them, and search by name.

## Team tokens

Each team authenticates with a shared team token. Admins can generate a new login token for any non-privileged team. Useful for getting teams back in when they've lost access to their account.

## Divisions

Teams pick a division at registration. Divisions are configured in the `<red>divisions</red>` config option:

```yaml
divisions:
  open: Open
  student: Student
defaultDivision: open
```

You can restrict which divisions are available based on email with [division ACLs](/configuration#division-acls).

## Team members

When `<red>userMembers</red>` is enabled in the configuration (which is the default), teams can add members by email. This is purely informational, and members share the same team token.

| Setting                  | Default     | Description                 |
| ------------------------ | ----------- | --------------------------- |
| `<red>userMembers</red>` | `true{:ts}` | Enable team members feature |
| `<red>maxMembers</red>`  | `50{:ts}`   | Maximum members per team    |

## Account requirements

Every user account must have at least one authentication method:

- An **email** address, used for registration, recovery, and email-based features.
- A **CTFtime ID**, used for CTFtime OAuth authentication.

A user can't remove their email if they have no CTFtime ID linked, and vice versa.
