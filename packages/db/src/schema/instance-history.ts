import type { ExposeKind, InstanceEndReason } from '@rctf/types'
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export type InstanceHistoryEndpoint = {
  kind: ExposeKind
  host: string
  port: number
}

// One row per instance a team started, from start to end. Admin teams'
// test instances are not recorded.
export const instanceHistory = pgTable(
  'instance_history',
  {
    id: text().primaryKey().notNull(),
    teamId: text('team_id').notNull(),
    // null when started with a team token rather than a player login
    playerId: text('player_id'),
    challengeId: text('challenge_id').notNull(),
    ip: text().notNull(),
    endpoints: jsonb().$type<InstanceHistoryEndpoint[]>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    // when the instancer said it would stop; null without a time limit
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
    endReason: text('end_reason').$type<InstanceEndReason>(),
    extendCount: integer('extend_count').notNull().default(0),
  },
  table => [
    index('instance_history_team_challenge_index').on(
      table.teamId,
      table.challengeId,
      table.endedAt
    ),
    index('instance_history_started_at_index').on(table.startedAt.desc()),
  ]
)
