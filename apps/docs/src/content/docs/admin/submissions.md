---
title: Submissions
description: Viewing and managing challenge submissions in rCTF.
order: 4
---

rCTF keeps accepted solves and a broader submission log. The admin panel can remove solves and inspect the IP history for flag attempts and admin bot jobs.

## AI links and solver proof

By default, every flag submission must include:

- **AI links**: links to the AI conversations the player used, added one at a time with the **+** button. A player who didn't use AI ticks **I didn't use AI**, which sends exactly `no ai`.
- **Solver proof**: one file of any type, such as the solve script or a screenshot that shows the flag. The limit is `<red>maxProofSize</red>` (5 MB by default).

Both are recorded for every attempt, including wrong flags. On the **Submissions** page, expand a row to see them. AI links open in a new tab. Clicking the proof opens a preview:

- **Images** are shown inline.
- **Scripts and other text files** are shown as text. HTML and SVG source is shown as text and never rendered.
- **Video and audio** play inline.
- **Other files** have no preview.

Every preview also has a **Download** button.

Proof files are stored privately in the database and deduplicated by content, so a team re-submitting the same script stores it once. They are never served through the public uploads path.

Turn the requirement off in **Admin → Settings → Submissions**, or set `<red>requireSubmissionEvidence</red>: false` in the config, for example for a practice round. While it is off, the fields are hidden and flags can be submitted alone.

## Viewing solves

The solve list shows the team, timestamp, and placement for each accepted flag.

## Deleting solves

Admins with `challsSolveWrite` can remove a solve caused by cheating, a leaked flag, or an administrative mistake.

:::warning
Deleting a solve triggers an automatic leaderboard recalculation, and the team's score and rank update to match.
:::

## Submission tracking

Each solve records the submitter's IP address. The submissions table also records flag attempts and admin bot submissions, with filters for time, challenge, team, IP, submission type, and result. Use it to investigate activity such as several teams submitting the same flag from the same address.

The **Player** column shows which team member submitted, by their Discord display name (hover for their username). It is empty for submissions made with a team token and for ones recorded before players were tracked, and shows "Deleted player" once that account has been deleted. The team search also matches player names.

## Exporting

**Export** in the Submissions toolbar downloads an Excel file of every submission that matches the current filters, search and sort. It includes all matching rows, not only the loaded pages.

- The **Summary** sheet lists the CTF, the export time (UTC), the sort, and the applied filters. It also has a table of submissions, correct, cheated and incorrect counts, and distinct teams for each challenge. Each challenge name links to its sheet.
- **One sheet per challenge**, ordered by category and then name, has these columns: time (UTC), team, division, whether the team is banned, player, Discord username, IP, kind, result, submitted flag, AI links, proof file name and SHA-256, and the team a cheated flag belonged to.

One export holds up to 50,000 submissions. Above that the export is refused, so narrow the filters, for example to a time range, and export in parts.

## First bloods

The first three solves, ordered by timestamp, are first, second, and third blood. A configured [blood bot](/integrations/bloodbot) announces them automatically.
