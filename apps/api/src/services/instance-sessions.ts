import { config } from '@rctf/config'
import {
  instanceHistory,
  instanceSessions,
  type DatabaseClient,
  type InstanceSessionChunk,
} from '@rctf/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  bareHost,
  candidatesFor,
  matchInstance,
  type IngestResult,
} from './instance-requests'

const MAX_KEY = 64
const MAX_HOST = 255
const MAX_IP = 64
const MAX_ERROR = 200
const MAX_CHUNKS = 4000
// what is kept of each direction; the proxy keeps 16 KB by default
const MAX_TRANSCRIPT_BYTES = 64 * 1024
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

export type ParsedSession = {
  sessionKey: string
  host: string
  clientIp: string
  startedAt: string
  durationMs: number
  open: boolean
  bytesIn: number
  bytesOut: number
  truncated: boolean
  error: string | null
  transcript: InstanceSessionChunk[]
}

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value !== '' && value.length <= max
    ? value
    : null

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null

const decodedLength = (data: string) =>
  (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)

// The transcript chunks, or null when any is malformed. Chunks past the
// per-direction limit are dropped, which marks the session truncated.
const parseTranscript = (
  value: unknown
): { chunks: InstanceSessionChunk[]; cut: boolean } | null => {
  if (!Array.isArray(value) || value.length > MAX_CHUNKS) return null
  const kept = { in: 0, out: 0 }
  const chunks: InstanceSessionChunk[] = []
  let cut = false
  for (const chunk of value as unknown[]) {
    if (typeof chunk !== 'object' || chunk === null) return null
    const { dir, t, data } = chunk as Record<string, unknown>
    if (dir !== 'in' && dir !== 'out') return null
    const offset = count(t)
    if (
      offset === null ||
      typeof data !== 'string' ||
      data.length % 4 !== 0 ||
      !BASE64_PATTERN.test(data)
    ) {
      return null
    }
    const size = decodedLength(data)
    if (kept[dir] + size > MAX_TRANSCRIPT_BYTES) {
      cut = true
      continue
    }
    kept[dir] += size
    chunks.push({ dir, t: offset, data })
  }
  return { chunks, cut }
}

// One connection record printed by the instancer's tcplog proxy, or null for
// anything else.
export const parseTcpSession = (
  entry: Record<string, unknown>
): ParsedSession | null => {
  if (entry.kind !== 'tcp-session') return null
  const sessionKey = text(entry.id, MAX_KEY)
  const host = text(entry.host, MAX_HOST)
  const clientIp = text(entry.clientIp, MAX_IP)
  const started = text(entry.startedAt, 64)
  const durationMs = count(entry.durationMs)
  const bytesIn = count(entry.bytesIn)
  const bytesOut = count(entry.bytesOut)
  if (
    !sessionKey ||
    !KEY_PATTERN.test(sessionKey) ||
    !host ||
    !clientIp ||
    !started ||
    durationMs === null ||
    bytesIn === null ||
    bytesOut === null ||
    typeof entry.open !== 'boolean' ||
    typeof entry.truncated !== 'boolean'
  ) {
    return null
  }
  const at = Date.parse(started)
  if (Number.isNaN(at)) return null
  const transcript = parseTranscript(entry.transcript)
  if (!transcript) return null

  const error =
    typeof entry.error === 'string' && entry.error !== ''
      ? entry.error.slice(0, MAX_ERROR)
      : null
  return {
    sessionKey,
    host: bareHost(host),
    clientIp,
    startedAt: new Date(at).toISOString(),
    // an int column holds about 24 days
    durationMs: Math.min(durationMs, 2_000_000_000),
    open: entry.open,
    bytesIn,
    bytesOut,
    truncated: entry.truncated || transcript.cut,
    error,
    transcript: transcript.chunks,
  }
}

// Of several reports of one connection in a batch, the latest: a closed one,
// or else the one that ran longest.
const latestReports = (sessions: ParsedSession[]): ParsedSession[] => {
  const byKey = new Map<string, ParsedSession>()
  for (const session of sessions) {
    const seen = byKey.get(session.sessionKey)
    const newer =
      !seen ||
      (seen.open && !session.open) ||
      (seen.open === session.open && session.durationMs >= seen.durationMs)
    if (newer) byKey.set(session.sessionKey, session)
  }
  return [...byKey.values()]
}

// Stores a batch of connection records against the instances they reached,
// matched by hostname and start time like the HTTP request logs. The proxy
// reports a connection while it is open and again when it closes; a later
// report replaces the stored one. Each instance keeps its newest
// `maxSessionsPerInstance` connections; its total counts every one.
export const ingestInstanceSessions = async (
  db: DatabaseClient,
  entries: readonly Record<string, unknown>[],
  maxPerInstance = config.instanceRequestLogs?.maxSessionsPerInstance ?? 500
): Promise<IngestResult> => {
  const parsed = entries.map(parseTcpSession)
  const valid = parsed.filter(session => session !== null)
  const invalid = parsed.length - valid.length
  if (valid.length === 0) return { stored: 0, unmatched: 0, invalid }

  const candidates = await candidatesFor(db, [
    ...new Set(valid.map(session => session.host)),
  ])
  const matched = valid.flatMap(session => {
    const instance = matchInstance(
      candidates.get(session.host),
      Date.parse(session.startedAt)
    )
    return instance ? [{ ...session, instanceId: instance.id }] : []
  })
  const unmatched = valid.length - matched.length
  if (matched.length === 0) return { stored: 0, unmatched, invalid }

  const byInstance = new Map<string, ParsedSession[]>()
  for (const { instanceId, ...session } of matched) {
    byInstance.set(instanceId, [...(byInstance.get(instanceId) ?? []), session])
  }

  let stored = 0
  await db.transaction(async tx => {
    for (const [instanceId, sessions] of byInstance) {
      const rows = latestReports(sessions).map(session => ({
        ...session,
        instanceId,
      }))
      stored += rows.length
      const written = await tx
        .insert(instanceSessions)
        .values(rows)
        .onConflictDoUpdate({
          target: [instanceSessions.instanceId, instanceSessions.sessionKey],
          set: {
            durationMs: sql`excluded.duration_ms`,
            open: sql`excluded.open`,
            bytesIn: sql`excluded.bytes_in`,
            bytesOut: sql`excluded.bytes_out`,
            truncated: sql`excluded.truncated`,
            error: sql`excluded.error`,
            transcript: sql`excluded.transcript`,
          },
        })
        // xmax is 0 for a row this statement inserted, not updated
        .returning({ inserted: sql<boolean>`(xmax = 0)` })
      const inserted = written.filter(row => row.inserted).length
      const lastStart = rows.reduce(
        (last, row) => (row.startedAt > last ? row.startedAt : last),
        rows[0]?.startedAt ?? ''
      )

      await tx
        .update(instanceHistory)
        .set({
          sessionCount: sql`${instanceHistory.sessionCount} + ${inserted}`,
          lastSessionAt: sql`greatest(coalesce(${instanceHistory.lastSessionAt}, ${lastStart}::timestamptz), ${lastStart}::timestamptz)`,
        })
        .where(eq(instanceHistory.id, instanceId))
      // keep only the newest connections
      await tx
        .delete(instanceSessions)
        .where(
          inArray(
            instanceSessions.id,
            tx
              .select({ id: instanceSessions.id })
              .from(instanceSessions)
              .where(eq(instanceSessions.instanceId, instanceId))
              .orderBy(
                desc(instanceSessions.startedAt),
                desc(instanceSessions.id)
              )
              .offset(maxPerInstance)
          )
        )
    }
  })

  return { stored, unmatched, invalid }
}

// A page of an instance's kept connections, newest first.
export const getInstanceSessions = async (
  db: DatabaseClient,
  instanceId: string,
  params: { limit: number; offset: number; clientIp?: string | undefined }
) => {
  const where = and(
    eq(instanceSessions.instanceId, instanceId),
    params.clientIp ? eq(instanceSessions.clientIp, params.clientIp) : undefined
  )
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: instanceSessions.id,
        startedAt: instanceSessions.startedAt,
        durationMs: instanceSessions.durationMs,
        open: instanceSessions.open,
        clientIp: instanceSessions.clientIp,
        host: instanceSessions.host,
        bytesIn: instanceSessions.bytesIn,
        bytesOut: instanceSessions.bytesOut,
        truncated: instanceSessions.truncated,
        error: instanceSessions.error,
        transcript: instanceSessions.transcript,
      })
      .from(instanceSessions)
      .where(where)
      .orderBy(desc(instanceSessions.startedAt), desc(instanceSessions.id))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(instanceSessions)
      .where(where),
  ])
  return {
    total: total?.count ?? 0,
    sessions: rows.map(row => ({ ...row, id: String(row.id) })),
  }
}

// What an instance's kept connections add up to.
export const getInstanceSessionSummary = async (
  db: DatabaseClient,
  instanceId: string
) => {
  const [row] = await db
    .select({
      kept: sql<number>`count(*)::int`,
      uniqueIps: sql<number>`count(distinct ${instanceSessions.clientIp})::int`,
    })
    .from(instanceSessions)
    .where(eq(instanceSessions.instanceId, instanceId))
  return row ?? { kept: 0, uniqueIps: 0 }
}
