---
title: CLI
description: Operational command-line tool for deployment tasks, managing admin permissions, seeding demo data, and exporting archives.
order: 8
---

The `<red>rctf</red>` CLI bundles rCTF's operational tooling: deployment helpers, admin management, database seeding, and static exports.

## Invocation

From a source checkout, run it through the root script:

```ansi
$ <red><dim>bun</dim> rctf</red> user list-admins
```

The production Docker image includes `<red>rctf</red>` on `<yellow>PATH</yellow>`, so commands can run inside the container next to the live instance:

```ansi
$ <red>docker</red> exec rctf-rctf-1 <red>rctf</red> user list-admins
```

The CLI reads the same `rctf.d/{:dir}` configuration as the API, or the directory set by `<yellow>RCTF_CONF_PATH</yellow>`, and talks to the database and Redis directly.

## Commands

### `<red>rctf</red> config get`

Prints the resolved value at a dot-separated [configuration](/configuration) path.

```ansi
$ <red><dim>bun</dim> rctf</red> config get database.migrate
before
$ <red><dim>bun</dim> rctf</red> config get leaderboard.maxLimit
100
```

### `<red>rctf</red> user create-admin`

Creates a new team with admin permissions. Without `<dim>--perms</dim>`, the team gets full admin access.

```ansi
$ <red><dim>bun</dim> rctf</red> user create-admin organizers <dim>--discord-id</dim> 80351110224678912
$ <red><dim>bun</dim> rctf</red> user create-admin authors <dim>--perms</dim> challsRead,challsWrite
```

With [Discord login](/configuration#discord-login), `<dim>--discord-id</dim>` makes that Discord account the team captain, so it is an admin as soon as it logs in. The command also prints the team token, which other organizers use to join from the **Team** page. Admin teams have no size limit.

Without Discord login, the command prints a login URL for the new team instead.

| Flag | Default | Description |
| --- | --- | --- |
| `<dim>--discord-id</dim>` | - | Discord user ID to add as captain. The account must not already be on a team. |
| `<dim>--email</dim>` | - | Team email, for the legacy team login. |
| `<dim>--division</dim>` | default division | Division for the team. |
| `<dim>--perms</dim>` | all permissions | Comma-separated [permission names](/admin#permissions). |

### `<red>rctf</red> user promote`

Grants permissions to a team. The target can be the team's email, its name, or the Discord ID of one of its players. Without `<dim>--perms</dim>`, the command grants full admin access.

```ansi
$ <red><dim>bun</dim> rctf</red> user promote admin@example.com
$ <red><dim>bun</dim> rctf</red> user promote author@example.com <dim>--perms</dim> challsRead,challsWrite
$ <red><dim>bun</dim> rctf</red> user promote organizers
$ <red><dim>bun</dim> rctf</red> user promote 80351110224678912
```

| Flag | Default | Description |
| --- | --- | --- |
| `<dim>--perms</dim>` | all permissions | Comma-separated [permission names](/admin#permissions). |

### `<red>rctf</red> user demote`

Resets a team's permissions to zero. It accepts the same targets as `user promote`.

```ansi
$ <red><dim>bun</dim> rctf</red> user demote author@example.com
```

### `<red>rctf</red> user list-admins`

Lists every user holding any permissions.

### `<red>rctf</red> seed`

Wipes the database and fills it with demo data.

```ansi
$ <red><dim>bun</dim> rctf</red> seed
```

:::warning
Seeding deletes all users, challenges, solves, submissions, and settings. When `<yellow>NODE_ENV</yellow>=<green>production</green>`, the command refuses to run unless `<dim>--force</dim>` is passed.
:::

### `<red>rctf</red> export`

Exports a static, read-only archive of a running instance. See [Static export](/archiving) for the full flag reference.

### `<red>rctf</red> deployment generate-csp`

Generates nginx security-header directives from the current configuration and outputs it to stdout. The output includes a provider-aware `Content-Security-Policy{:http}` header plus `Referrer-Policy{:http}`, `X-Frame-Options{:http}`, and `X-Content-Type-Options{:http}`. The command reads Svelte's generated CSP directives from `<dim>--web-build</dim>` (default: `apps/web/build/{:dir}`), merges them with the runtime policy and any extra sources from the [`<red>csp</red>` config option](/configuration#csp), and removes duplicate sources.

The production container runs this command automatically at startup.

### `<red>rctf</red> deployment generate-avatar-body-limit`

Generates a nginx `client_max_body_size{:nginx}` directive for the avatar upload endpoint and outputs it to stdout. The limit is the [`<red>maxAvatarSize</red>` config option](/configuration#limits) plus headroom for the multipart request framing, so the proxy never rejects uploads the API would accept.

The production container runs this command automatically at startup.
