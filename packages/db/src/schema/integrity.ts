import {
  IntegrityCaseStatus,
  type IntegritySeverity,
  type IntegritySignalKind,
} from '@rctf/types'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export type IntegrityEvidence = Record<string, unknown>

// A team pair (or a single team) under review. Signals about the same pair
// collect into one case so they can be judged together.
export const integrityCases = pgTable(
  'integrity_cases',
  {
    id: text().primaryKey().notNull(),
    // the pair is stored with the smaller id first
    teamId: text('team_id').notNull(),
    otherTeamId: text('other_team_id'),
    pairKey: text('pair_key').notNull().unique(),
    status: text()
      .$type<IntegrityCaseStatus>()
      .notNull()
      .default(IntegrityCaseStatus.OPEN),
    score: integer().notNull().default(0),
    signalCount: integer('signal_count').notNull().default(0),
    lastSignalAt: timestamp('last_signal_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    note: text(),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('integrity_cases_status_score_index').on(
      table.status,
      table.score.desc()
    ),
  ]
)

export const integritySignals = pgTable(
  'integrity_signals',
  {
    id: text().primaryKey().notNull(),
    caseId: text('case_id').notNull(),
    kind: text().$type<IntegritySignalKind>().notNull(),
    severity: text().$type<IntegritySeverity>().notNull(),
    teamId: text('team_id').notNull(),
    otherTeamId: text('other_team_id'),
    challengeId: text('challenge_id'),
    evidence: jsonb().$type<IntegrityEvidence>().notNull(),
    // one signal per kind, pair, challenge and piece of evidence, so a
    // repeated attempt never records (or alerts) twice
    dedupKey: text('dedup_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('integrity_signals_case_created_at_index').on(
      table.caseId,
      table.createdAt.desc()
    ),
    foreignKey({
      columns: [table.caseId],
      foreignColumns: [integrityCases.id],
      name: 'integrity_signals_case_id_fkey',
    }).onDelete('cascade'),
  ]
)
