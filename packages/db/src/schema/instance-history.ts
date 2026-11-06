import type { ExposeKind, InstanceEndReason } from '@rctf/types'
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
    // HTTP requests that reached it, counted even once old ones are dropped
    requestCount: integer('request_count').notNull().default(0),
    firstRequestAt: timestamp('first_request_at', {
      withTimezone: true,
      mode: 'string',
    }),
    lastRequestAt: timestamp('last_request_at', {
      withTimezone: true,
      mode: 'string',
    }),
    // TCP connections to it, counted even once old ones are dropped
    sessionCount: integer('session_count').notNull().default(0),
    lastSessionAt: timestamp('last_session_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  table => [
    index('instance_history_team_challenge_index').on(
      table.teamId,
      table.challengeId,
      table.endedAt
    ),
    index('instance_history_started_at_index').on(table.startedAt.desc()),
    // request logs find an instance by one of its hostnames
    index('instance_history_endpoints_index').using('gin', table.endpoints),
  ]
)

// HTTP requests to an instance, from the instancer's Traefik access log.
// Only the newest few thousand per instance are kept.
export const instanceRequests = pgTable(
  'instance_requests',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    instanceId: text('instance_id').notNull(),
    at: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
    clientIp: text('client_ip').notNull(),
    method: text().notNull(),
    host: text().notNull(),
    path: text().notNull(),
    status: integer().notNull(),
    bytes: bigint({ mode: 'number' }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    userAgent: text('user_agent'),
  },
  table => [
    index('instance_requests_instance_at_index').on(
      table.instanceId,
      table.at.desc()
    ),
    foreignKey({
      columns: [table.instanceId],
      foreignColumns: [instanceHistory.id],
      name: 'instance_requests_instance_id_fkey',
    }).onDelete('cascade'),
  ]
)

export type InstanceSessionChunk = {
  // 'in' is what the player sent, 'out' what the challenge answered
  dir: 'in' | 'out'
  // milliseconds after the connection opened
  t: number
  // base64
  data: string
}

// TCP connections to an instance's tcp-ssl exposes, from the instancer's
// tcplog proxy, with the start of what was sent each way. A connection still
// open is updated as the proxy reports it. Only the newest few hundred per
// instance are kept.
export const instanceSessions = pgTable(
  'instance_sessions',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    instanceId: text('instance_id').notNull(),
    // the proxy's ID for the connection
    sessionKey: text('session_key').notNull(),
    startedAt: timestamp('started_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    open: boolean().notNull(),
    clientIp: text('client_ip').notNull(),
    host: text().notNull(),
    bytesIn: bigint('bytes_in', { mode: 'number' }).notNull(),
    bytesOut: bigint('bytes_out', { mode: 'number' }).notNull(),
    truncated: boolean().notNull(),
    error: text(),
    transcript: jsonb().$type<InstanceSessionChunk[]>().notNull(),
  },
  table => [
    index('instance_sessions_instance_started_index').on(
      table.instanceId,
      table.startedAt.desc()
    ),
    uniqueIndex('instance_sessions_instance_key_index').on(
      table.instanceId,
      table.sessionKey
    ),
    foreignKey({
      columns: [table.instanceId],
      foreignColumns: [instanceHistory.id],
      name: 'instance_sessions_instance_id_fkey',
    }).onDelete('cascade'),
  ]
)
