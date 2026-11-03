import { config } from '@rctf/config'
import {
  instanceHistory,
  instanceRequests,
  type DatabaseClient,
} from '@rctf/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

const MAX_PATH = 2048
const MAX_USER_AGENT = 512
// Traefik logs a request when it ends, a moment after rCTF recorded the
// instance's start or stop
const LIFETIME_SLACK_MS = 60_000

export type ParsedRequest = {
  at: string
  clientIp: string
  method: string
  host: string
  path: string
  status: number
  bytes: number
  durationMs: number
  userAgent: string | null
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

// the host without a port, as instance hostnames are stored
const bareHost = (host: string) =>
  host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')

// One line of Traefik's JSON access log, or null for anything that isn't an
// HTTP request (Traefik's own log lines go through the same stream).
export const parseTraefikAccessLog = (
  entry: Record<string, unknown>
): ParsedRequest | null => {
  const host = text(entry.RequestHost)
  const method = text(entry.RequestMethod)
  const path = text(entry.RequestPath)
  const start = text(entry.StartUTC)
  const status = number(entry.DownstreamStatus)
  const clientIp = text(entry.ClientHost)
  if (!host || !method || !path || !start || status === null || !clientIp) {
    return null
  }
  const at = Date.parse(start)
  if (Number.isNaN(at)) return null

  const userAgent = text(entry['request_User-Agent'])
  return {
    at: new Date(at).toISOString(),
    clientIp,
    method: method.slice(0, 16),
    host: bareHost(host),
    path: path.slice(0, MAX_PATH),
    status: Math.trunc(status),
    bytes: Math.max(0, Math.trunc(number(entry.DownstreamContentSize) ?? 0)),
    // Traefik reports nanoseconds
    durationMs: Math.max(
      0,
      Math.round((number(entry.Duration) ?? 0) / 1_000_000)
    ),
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null,
  }
}

type Candidate = {
  id: string
  endpoints: { host: string }[]
  startedAt: number
  endsAt: number
}

// The instances that ever used these hostnames, with the time each one was
// up. An open instance past its expiry ended at its expiry.
const candidatesFor = async (
  db: DatabaseClient,
  hosts: readonly string[]
): Promise<Map<string, Candidate[]>> => {
  const rows = await db
    .select({
      id: instanceHistory.id,
      endpoints: instanceHistory.endpoints,
      startedAt: instanceHistory.startedAt,
      endedAt: instanceHistory.endedAt,
      expiresAt: instanceHistory.expiresAt,
    })
    .from(instanceHistory)
    .where(
      sql`${instanceHistory.endpoints} @> ANY (ARRAY[${sql.join(
        hosts.map(host => sql`${JSON.stringify([{ host }])}::jsonb`),
        sql`, `
      )}])`
    )

  const byHost = new Map<string, Candidate[]>()
  for (const row of rows) {
    const end = row.endedAt ?? row.expiresAt
    const candidate: Candidate = {
      id: row.id,
      endpoints: row.endpoints,
      startedAt: Date.parse(row.startedAt),
      endsAt: end ? Date.parse(end) : Number.POSITIVE_INFINITY,
    }
    for (const { host } of row.endpoints) {
      const key = host.toLowerCase()
      if (!hosts.includes(key)) continue
      byHost.set(key, [...(byHost.get(key) ?? []), candidate])
    }
  }
  return byHost
}

const matchInstance = (candidates: Candidate[] | undefined, at: number) =>
  candidates?.find(
    candidate =>
      at >= candidate.startedAt - LIFETIME_SLACK_MS &&
      at <= candidate.endsAt + LIFETIME_SLACK_MS
  )

export type IngestResult = {
  stored: number
  unmatched: number
  invalid: number
}

// Stores a batch of access log entries against the instances they reached:
// by hostname, and by time, since a restarted instance can get the same
// hostname again. Each instance keeps its newest `maxPerInstance` requests;
// its totals count every one.
export const ingestInstanceRequests = async (
  db: DatabaseClient,
  entries: readonly Record<string, unknown>[],
  maxPerInstance = config.instanceRequestLogs?.maxPerInstance ?? 2000
): Promise<IngestResult> => {
  const parsed = entries.map(parseTraefikAccessLog)
  const requests = parsed.filter(
    (request): request is ParsedRequest => request !== null
  )
  const invalid = parsed.length - requests.length
  if (requests.length === 0) return { stored: 0, unmatched: 0, invalid }

  const candidates = await candidatesFor(db, [
    ...new Set(requests.map(request => request.host)),
  ])
  const rows = requests.flatMap(request => {
    const instance = matchInstance(
      candidates.get(request.host),
      Date.parse(request.at)
    )
    return instance ? [{ ...request, instanceId: instance.id }] : []
  })
  const unmatched = requests.length - rows.length
  if (rows.length === 0) return { stored: 0, unmatched, invalid }

  const perInstance = new Map<
    string,
    { count: number; first: string; last: string }
  >()
  for (const row of rows) {
    const totals = perInstance.get(row.instanceId)
    if (!totals) {
      perInstance.set(row.instanceId, { count: 1, first: row.at, last: row.at })
      continue
    }
    totals.count++
    if (row.at < totals.first) totals.first = row.at
    if (row.at > totals.last) totals.last = row.at
  }

  await db.transaction(async tx => {
    await tx.insert(instanceRequests).values(rows)
    for (const [instanceId, totals] of perInstance) {
      await tx
        .update(instanceHistory)
        .set({
          requestCount: sql`${instanceHistory.requestCount} + ${totals.count}`,
          firstRequestAt: sql`least(coalesce(${instanceHistory.firstRequestAt}, ${totals.first}::timestamptz), ${totals.first}::timestamptz)`,
          lastRequestAt: sql`greatest(coalesce(${instanceHistory.lastRequestAt}, ${totals.last}::timestamptz), ${totals.last}::timestamptz)`,
        })
        .where(eq(instanceHistory.id, instanceId))
      // keep only the newest requests
      await tx
        .delete(instanceRequests)
        .where(
          inArray(
            instanceRequests.id,
            tx
              .select({ id: instanceRequests.id })
              .from(instanceRequests)
              .where(eq(instanceRequests.instanceId, instanceId))
              .orderBy(desc(instanceRequests.at), desc(instanceRequests.id))
              .offset(maxPerInstance)
          )
        )
    }
  })

  return { stored: rows.length, unmatched, invalid }
}

export type InstanceRequestFilters = {
  clientIp?: string | undefined
  statusClass?: number | undefined
  pathSearch?: string | undefined
}

const requestFilters = (instanceId: string, filters: InstanceRequestFilters) =>
  and(
    eq(instanceRequests.instanceId, instanceId),
    filters.clientIp
      ? eq(instanceRequests.clientIp, filters.clientIp)
      : undefined,
    filters.statusClass
      ? sql`${instanceRequests.status} / 100 = ${filters.statusClass}`
      : undefined,
    filters.pathSearch
      ? sql`lower(${instanceRequests.path}) like ${`%${filters.pathSearch.toLowerCase()}%`}`
      : undefined
  )

// A page of an instance's kept requests, newest first.
export const getInstanceRequests = async (
  db: DatabaseClient,
  instanceId: string,
  params: InstanceRequestFilters & { limit: number; offset: number }
) => {
  const where = requestFilters(instanceId, params)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: instanceRequests.id,
        at: instanceRequests.at,
        clientIp: instanceRequests.clientIp,
        method: instanceRequests.method,
        host: instanceRequests.host,
        path: instanceRequests.path,
        status: instanceRequests.status,
        bytes: instanceRequests.bytes,
        durationMs: instanceRequests.durationMs,
        userAgent: instanceRequests.userAgent,
      })
      .from(instanceRequests)
      .where(where)
      .orderBy(desc(instanceRequests.at), desc(instanceRequests.id))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(instanceRequests)
      .where(where),
  ])
  return {
    total: total?.count ?? 0,
    requests: rows.map(row => ({ ...row, id: String(row.id) })),
  }
}

// What an instance's kept requests add up to.
export const getInstanceRequestSummary = async (
  db: DatabaseClient,
  instanceId: string
) => {
  const [row] = await db
    .select({
      kept: sql<number>`count(*)::int`,
      uniqueIps: sql<number>`count(distinct ${instanceRequests.clientIp})::int`,
      status2xx: sql<number>`count(*) filter (where ${instanceRequests.status} / 100 = 2)::int`,
      status3xx: sql<number>`count(*) filter (where ${instanceRequests.status} / 100 = 3)::int`,
      status4xx: sql<number>`count(*) filter (where ${instanceRequests.status} / 100 = 4)::int`,
      status5xx: sql<number>`count(*) filter (where ${instanceRequests.status} / 100 = 5)::int`,
    })
    .from(instanceRequests)
    .where(eq(instanceRequests.instanceId, instanceId))
  return (
    row ?? {
      kept: 0,
      uniqueIps: 0,
      status2xx: 0,
      status3xx: 0,
      status4xx: 0,
      status5xx: 0,
    }
  )
}
