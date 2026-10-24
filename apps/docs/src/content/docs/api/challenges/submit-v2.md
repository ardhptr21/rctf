---
title: "`<route>POST</route>` Submit a flag with evidence"
description: "`<route>POST /api/v2/challs/:id/submit</route>`"
order: 3
---

:::aside

::route-example{def="SubmitFlagRouteV2"}

:::

::route-meta{def="SubmitFlagRouteV2" rateLimit="Burst `5`, refill window `25000` ms, scoped to user and challenge."}

Submits a flag together with the evidence organizers ask for. The body is `multipart/form-data`:

- `flag`: the flag.
- `aiLinks`: a link to an AI conversation used while solving. Repeat the field for more links (up to 10). If no AI was used, send the single value `no ai`.
- `proof`: one solver proof file of any type, for example the solve script or a screenshot that shows the flag. The size limit is `<red>maxProofSize</red>` (5 MB by default).

When [submission evidence](/admin/submissions/#ai-links-and-solver-proof) is required, a missing or invalid `aiLinks` returns `<response>400 badAiLinks</response>` and a missing `proof` returns `<response>400 badProofRequired</response>`. Both fields are optional when the requirement is off.

The links and proof are recorded for every attempt, including wrong flags, and only admins can see them.

::request-body{def="SubmitFlagRouteV2" title="Request body"}
