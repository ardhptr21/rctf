import { z } from 'zod/mini'
import {
  IntegrityCaseStatus,
  IntegritySeverity,
  IntegritySignalKind,
} from '../enums/integrity'
import { response } from '../internal'
import { example } from '../util/example'

const IntegrityTeamSchema = z.object({
  id: example(z.string(), 'team-1a2b3c').check(z.describe('Team ID.')),
  name: example(z.string(), 'otter-sec').check(
    z.describe('Team name, or its ID once the team is deleted.')
  ),
  banned: example(z.boolean(), false).check(
    z.describe('Whether the team is banned.')
  ),
})

export const IntegrityCaseSchema = z.object({
  id: example(z.string(), 'case-1a2b3c').check(z.describe('Case ID.')),
  status: z.enum(IntegrityCaseStatus).check(z.describe('Review status.')),
  score: example(z.int(), 24).check(
    z.describe(
      'Risk score: severity weights summed, raised when several kinds agree.'
    )
  ),
  signalCount: example(z.int(), 3).check(z.describe('Number of signals.')),
  kinds: z
    .array(z.enum(IntegritySignalKind))
    .check(z.describe('Distinct signal kinds in the case.')),
  team: IntegrityTeamSchema,
  otherTeam: z
    .nullable(IntegrityTeamSchema)
    .check(z.describe('The second team, or `null` for a single-team case.')),
  lastSignalAt: example(z.int(), 1735689600000).check(
    z.describe('When the latest signal was recorded (Unix ms).')
  ),
  createdAt: example(z.int(), 1735603200000).check(
    z.describe('When the case was opened (Unix ms).')
  ),
  note: example(z.nullable(z.string()), null).check(
    z.describe('Reviewer note, or `null`.')
  ),
  resolvedAt: example(z.nullable(z.int()), null).check(
    z.describe('When the case was dismissed or actioned (Unix ms), or `null`.')
  ),
})

export const IntegritySignalSchema = z.object({
  id: example(z.string(), 'signal-1a2b3c').check(z.describe('Signal ID.')),
  kind: z.enum(IntegritySignalKind).check(z.describe('What was detected.')),
  severity: z.enum(IntegritySeverity).check(z.describe('How strong it is.')),
  teamId: example(z.string(), 'team-1a2b3c').check(
    z.describe('The team whose submission triggered the signal.')
  ),
  otherTeamId: example(z.nullable(z.string()), 'team-4d5e6f').check(
    z.describe('The other team involved, or `null`.')
  ),
  challenge: z
    .nullable(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
      })
    )
    .check(z.describe('The challenge involved, or `null` for shared IPs.')),
  evidence: example(z.record(z.string(), z.unknown()), {
    sha256: 'e3b0c442…',
    name: 'solve.py',
  }).check(
    z.describe(
      'What matched: `flag`, `ip`, `sha256` and `name`, or `link`, by kind.'
    )
  ),
  createdAt: example(z.int(), 1735689600000).check(
    z.describe('When the signal was recorded (Unix ms).')
  ),
})

export const GoodAdminIntegrityCases = response('goodAdminIntegrityCases', {
  status: 200,
  message: 'The integrity cases were retrieved.',
  data: z.object({
    cases: z.array(IntegrityCaseSchema),
    total: example(z.int(), 7).check(
      z.describe('Cases with this status, across all pages.')
    ),
  }),
})

export const GoodAdminIntegrityCase = response('goodAdminIntegrityCase', {
  status: 200,
  message: 'The integrity case was retrieved.',
  data: z.object({
    ...IntegrityCaseSchema.shape,
    signals: z
      .array(IntegritySignalSchema)
      .check(z.describe('Signals in the case, newest first.')),
  }),
})

export const GoodAdminIntegrityCaseUpdate = response(
  'goodAdminIntegrityCaseUpdate',
  {
    status: 200,
    message: 'The integrity case was updated.',
  }
)

export const BadIntegrityCaseNotFound = response('badIntegrityCaseNotFound', {
  status: 404,
  message: 'No integrity case has that ID.',
})
