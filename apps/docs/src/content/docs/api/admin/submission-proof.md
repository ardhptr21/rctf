---
title: "`<route>GET</route>` Submission proof"
description: "`<route>GET /api/v2/admin/submissions/:id/proof</route>`"
order: 19
---

:::aside

::route-example{def="GetAdminSubmissionProofRouteV2"}

:::

::route-meta{def="GetAdminSubmissionProofRouteV2"}

Returns the solver proof file attached to a submission log entry, base64-encoded with its original name and content type. The admin Submissions page uses it to preview proofs.

Proof files are only available through this route. They are not stored with the upload provider, so they are never publicly reachable.

::request-body{def="GetAdminSubmissionProofRouteV2" source="params" title="Path parameters"}

::response-body{def="GetAdminSubmissionProofRouteV2" response="goodSubmissionProof" title="Response fields"}
