---
title: Admin panel
description: Overview of rCTF administration, permissions, and settings management.
order: 5
---

The admin panel manages challenges, teams, solves, and runtime settings.

## Permissions

Each admin permission has a numeric value. Add the values together to grant several permissions to one account.

| Permission         | Value | Description                                         |
| ------------------ | ----- | --------------------------------------------------- |
| `challsRead`       | 1     | View challenges in admin panel                      |
| `challsWrite`      | 2     | Create, update, and delete challenges               |
| `leaderboardRead`  | 4     | View leaderboard data (required for CTFtime export) |
| `challsSolveWrite` | 8     | Delete solves                                       |
| `usersWrite`       | 16    | Manage users and generate team tokens               |
| `settingsWrite`    | 32    | Modify platform settings                            |

A full admin uses `63`, the sum of every permission.

### Creating admin accounts

After registering a normal account, grant admin permissions with the [rctf CLI](/admin/cli):

- For full admin:
   ```ansi
   $ <red><dim>bun</dim> rctf</red> user promote admin@example.com
   ```
- For challenge editors (read + write challenges):
   ```ansi
   $ <red><dim>bun</dim> rctf</red> user promote author@example.com <dim>--perms</dim> challsRead,challsWrite
   ```

If using Docker:

```ansi
$ <red>docker</red> exec rctf-rctf-1 <red>rctf</red> user promote admin@example.com
```

Use `$ <red>rctf</red> user demote <cyan><email></cyan>` to revoke all permissions and `$ <red>rctf</red> user list-admins` to see who currently has any.

### Permission bypass

Some permissions also bypass event timing. For example, `challsRead` can view released challenges before the CTF starts.

## Runtime settings

An account with `settingsWrite` can change the following settings without restarting rCTF.

| Setting           | Description                                 |
| ----------------- | ------------------------------------------- |
| CTF name          | Display name of the competition             |
| CTF start time    | Competition start time                      |
| CTF end time      | Competition end time                        |
| Scoreboard freeze | Time when the scoreboard stops updating     |
| Page access       | Who can view the challenges and scoreboard  |
| Team creation     | Whether Discord players can create new teams |
| Max team members  | Players allowed per team                    |
| Submission evidence | Whether flags need AI links and a solver proof |
| Home content      | Home page markdown content                  |
| Sponsors          | Sponsor list (name, icon, description, URL) |
| Meta description  | HTML meta description                       |
| Meta image URL    | HTML meta image URL                         |
| Favicon URL       | Browser favicon                             |
| Logo (light/dark) | Platform logos for light and dark mode      |

These settings override values from the config files. Setting a value to `null{:ts}` reverts to the config file default.

Start and end time overrides have to keep the start before the end. Runtime timing overrides are returned through the v2 client config.

### Scoreboard freeze

The scoreboard freeze hides the last part of the competition from teams. From the freeze time on, everything public shows the standings as of the freeze time: the leaderboard, the graph, team ranks and scores, challenge solve counts and points, per-challenge solver lists, first bloods, and other teams' profiles. Blood bot announcements are suppressed. Teams can still submit flags, and each team still sees its own solves.

The freeze does not lift on its own: the scoreboard stays frozen after the CTF ends, so you can reveal the results when you are ready, for example at a closing ceremony. To reveal the final standings, clear the freeze time in the admin settings. The leaderboard is then recomputed from every solve. The freeze time has to fall between the start and end time.

Admins with `leaderboardRead` can switch the scoreboard page to live standings during the freeze, or call the [live leaderboard](/api/admin/live-leaderboard/) route.

:::note
Points of dynamic-scoring challenges are not refreshed from feed updates during the freeze, and per-challenge dynamic score feeds are not frozen.
:::

### Page access

Each of the challenges page and the scoreboard page has one of three access levels:

| Level     | Who can view it                                                        |
| --------- | ---------------------------------------------------------------------- |
| `public`  | Anyone, without logging in (default)                                   |
| `private` | Any logged-in team                                                     |
| `admin`   | Accounts with an admin permission (`challsRead`, `usersWrite`, or `settingsWrite`) |

The level applies to the page and to the API routes behind it: the challenge list and solver routes for the challenges page, and the leaderboard routes for the scoreboard page. Flag submission always requires a login.

With [Discord login](/configuration#discord-login), a player who is signed in but not on a team cannot view challenges at any access level. The challenge routes return `<response>403 badNoTeam</response>` and the page asks them to create or join a team. The same applies to a `private` or `admin` scoreboard; a `public` scoreboard stays visible.

:::caution
[`rctf export`](/admin/cli/) fetches pages without logging in. Set both pages to `public` before exporting an archive.
:::
