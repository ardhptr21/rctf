---
title: Cheat detection
description: Reviewing suspicious activity found on flag submissions.
order: 5
---

rCTF checks every flag submission for signs of cheating and collects what it finds on **Admin → Integrity**. Nothing happens automatically: the detectors only record evidence, and admins decide what to do with it.

## What is detected

| Signal | Severity | Means |
| --- | --- | --- |
| **Flag sharing** | High | A team submitted another team's [dynamic flag](/providers/flags/). |
| **Duplicate proof** | High | Two teams uploaded the same solver proof file for the same challenge. |
| **Duplicate AI link** | Medium | Two teams gave the same AI conversation link for the same challenge. |
| **Shared IP** | Medium | Two teams submitted from the same IP address within the shared-IP window. |
| **Unlisted AI link** | High | A team gave an AI link that matches none of the allowed AI link patterns, set under **Admin → Settings → Submissions**. |
| **Solved without download** | Medium | A team solved a challenge that has attachments without ever downloading one from the challenge page. |
| **Mixed AI source** | Medium | A team gave an AI link from a different site than the one it usually uses. Off by default. |

The last three concern one team, so their cases have a single team. **Solved without download** relies on the challenge page reporting each download, so a team that fetched the file another way (a direct link shared by a teammate, or a script) is flagged too: treat it as a reason to look closer, not as proof.

Admin teams are never scanned or matched, since they [don't score](/admin/teams/#admin-teams-dont-score). The same piece of evidence between the same two teams is only recorded once, so repeated attempts don't pile up.

## Cases and risk scores

Signals about the same two teams are collected into one **case**. A case's risk score adds up its signals (high 10, medium 4, low 1) and is raised by half for each extra kind of signal, because independent kinds agreeing is much stronger evidence than one kind repeating. For example, a duplicate proof plus a shared IP scores 21. Cases are listed highest risk first.

## Reviewing a case

Click a case to see its signals with the challenge, the matching evidence and the time. From there you can:

- **Ban** either team. The case is then marked actioned.
- **Mark actioned** after dealing with it some other way, such as removing solves from the team's admin page.
- **Dismiss** a false positive, such as two teams on the same campus network.

Add a note to record why. Dismissed and actioned cases move to their own tabs and can be reopened. New evidence still attaches to a dismissed case, but doesn't send alerts.

## Settings

**Admin → Settings → Cheat detection** turns each detector on or off and sets:

- **Shared-IP window**: how far back to look for other teams on the same IP.
- **Ignored IPs and ranges**: addresses that never count as shared, one IP or CIDR range (like `10.0.0.0/8`) per line. Add the venue network for onsite events, where many teams share one address.
- **Alerts**: whether new signals send a message.

The **Unlisted AI link** check compares links with **Allowed AI link patterns** under **Admin → Settings → Submissions**: one regular expression per line, matched regardless of case, such as `^https://chatgpt\.com/share/` or `^https://chat\.deepseek\.com/`. Leave it empty to turn that check off. Submissions are never rejected for it.

The **Mixed AI source** check expects each team to stick to one AI assistant. It is off by default; turn it on under **Admin → Settings → Cheat detection**. A link's source is its site, such as `chatgpt.com` or `deepseek.com`, with `www.` dropped and a few aliases merged (`chat.openai.com` counts as `chatgpt.com`). The team's usual source is the one in most of its submissions, across every player and challenge; on a tie, the one used first. Every other source is recorded once, with how often each was used. For example, four submissions with ChatGPT links and one with a DeepSeek link record `deepseek.com`.

Alerts go to the messages providers in `integrity.alertDestinations` in the [configuration](/configuration/#cheat-detection), at or above `alertMinSeverity` (high by default). Each alert links to its case.
