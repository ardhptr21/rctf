import {
  ExposeKind,
  InstanceHistoryStatus,
  type FilterAdminInstancesRouteV2,
  type GetAdminInstanceRequestsRouteV2,
  type GetAdminInstanceRouteV2,
  type GetAdminInstanceSessionsRouteV2,
  type RouteResponseData,
} from '@rctf/types'
import type { AdminInstancesQueryParams } from '$lib/query/keys'
import { intervalToDuration } from '$lib/utils/time'

export type AdminInstancesPage = RouteResponseData<
  typeof FilterAdminInstancesRouteV2
>
export type AdminInstance = AdminInstancesPage['instances'][number]
export type AdminInstanceDetail = RouteResponseData<
  typeof GetAdminInstanceRouteV2
>
export type InstanceRequest = RouteResponseData<
  typeof GetAdminInstanceRequestsRouteV2
>['requests'][number]
export type InstanceSession = RouteResponseData<
  typeof GetAdminInstanceSessionsRouteV2
>['sessions'][number]
export type TranscriptChunk = InstanceSession['transcript'][number]

export const PAGE_SIZE = 50
export const ROW_HEIGHT = 52

export type StatusTab = InstanceHistoryStatus | 'all'

export const STATUS_TABS: readonly { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: InstanceHistoryStatus.RUNNING, label: 'Running' },
  { value: InstanceHistoryStatus.STOPPED, label: 'Stopped' },
  { value: InstanceHistoryStatus.SOLVED, label: 'Solved' },
  { value: InstanceHistoryStatus.EXPIRED, label: 'Expired' },
  { value: InstanceHistoryStatus.GONE, label: 'Gone' },
  { value: InstanceHistoryStatus.ERRORED, label: 'Errored' },
]

export const STATUS_LABEL: Record<InstanceHistoryStatus, string> = {
  [InstanceHistoryStatus.RUNNING]: 'Running',
  [InstanceHistoryStatus.STOPPED]: 'Stopped',
  [InstanceHistoryStatus.SOLVED]: 'Solved',
  [InstanceHistoryStatus.EXPIRED]: 'Expired',
  [InstanceHistoryStatus.GONE]: 'Gone',
  [InstanceHistoryStatus.ERRORED]: 'Errored',
}

export const STATUS_HINT: Record<InstanceHistoryStatus, string> = {
  [InstanceHistoryStatus.RUNNING]: 'Still running',
  [InstanceHistoryStatus.STOPPED]: 'The team stopped it',
  [InstanceHistoryStatus.SOLVED]:
    'Stopped automatically when the team solved the challenge',
  [InstanceHistoryStatus.EXPIRED]: 'Its time ran out',
  [InstanceHistoryStatus.GONE]:
    'The instancer no longer had it, for example it crashed or was removed',
  [InstanceHistoryStatus.ERRORED]: 'The instancer reported an error',
}

export type StatusTone = 'success' | 'info' | 'muted' | 'warning' | 'danger'

export function statusTone(status: InstanceHistoryStatus): StatusTone {
  switch (status) {
    case InstanceHistoryStatus.RUNNING:
      return 'success'
    case InstanceHistoryStatus.SOLVED:
      return 'info'
    case InstanceHistoryStatus.STOPPED:
    case InstanceHistoryStatus.EXPIRED:
      return 'muted'
    case InstanceHistoryStatus.GONE:
      return 'warning'
    case InstanceHistoryStatus.ERRORED:
      return 'danger'
  }
}

// How long it ran, or has run so far: "1h, 12m", "45s".
export function formatLifetime(
  startedAt: string,
  endedAt: string | null,
  now: number
): string {
  const end = endedAt ? Date.parse(endedAt) : now
  const { days, hours, minutes, seconds } = intervalToDuration(
    end - Date.parse(startedAt)
  )
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  return parts.length > 0 ? parts.join(', ') : `${seconds}s`
}

export function endpointLabel(endpoint: AdminInstance['endpoints'][number]) {
  return `${endpoint.host}:${endpoint.port}`
}

export type InstanceFilters = {
  status: StatusTab
  category: string | null
  teamId: string | null
  search: string
}

// The list request for the filters, without paging.
export function instanceQueryParams(
  filters: InstanceFilters
): AdminInstancesQueryParams {
  const search = filters.search.trim()
  return {
    limit: PAGE_SIZE,
    ...(search ? { search: search.slice(0, 100) } : {}),
    ...(filters.status === 'all'
      ? {}
      : { status: { include: [filters.status] } }),
    ...(filters.category !== null
      ? { category: { include: [filters.category] } }
      : {}),
    ...(filters.teamId !== null ? { team: { include: [filters.teamId] } } : {}),
  }
}

export type StatusClassTone = 'success' | 'info' | 'warning' | 'danger'

export function statusClassTone(status: number): StatusClassTone {
  if (status >= 500) return 'danger'
  if (status >= 400) return 'warning'
  if (status >= 300) return 'info'
  return 'success'
}

export const STATUS_CLASS_FILTERS: readonly {
  value: number | null
  label: string
}[] = [
  { value: null, label: 'All' },
  { value: 2, label: '2xx' },
  { value: 3, label: '3xx' },
  { value: 4, label: '4xx' },
  { value: 5, label: '5xx' },
]

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDurationMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`
}

export type RequestDetail = {
  label: string
  value: string
  // shown in monospace and allowed to wrap, for long values such as paths
  code?: boolean
}

// Everything kept about one request, for its expanded row. `localTime` is the
// request time already formatted for the viewer.
export function requestDetails(
  request: InstanceRequest,
  localTime: string
): RequestDetail[] {
  const size =
    request.bytes < 1024
      ? formatBytes(request.bytes)
      : `${formatBytes(request.bytes)} (${request.bytes.toLocaleString('en-US')} bytes)`
  // the API may send the database's timestamp format; show ISO 8601 in UTC
  const at = Date.parse(request.at)
  const utc = Number.isNaN(at) ? request.at : new Date(at).toISOString()
  return [
    { label: 'Time', value: localTime },
    { label: 'Time (UTC)', value: utc, code: true },
    { label: 'Client IP', value: request.clientIp, code: true },
    { label: 'Method', value: request.method },
    { label: 'Host', value: request.host, code: true },
    { label: 'Path', value: request.path, code: true },
    { label: 'Status', value: String(request.status) },
    { label: 'Response size', value: size },
    { label: 'Time taken', value: formatDurationMs(request.durationMs) },
    {
      label: 'User agent',
      value: request.userAgent ?? 'Not sent',
      code: request.userAgent !== null,
    },
    { label: 'Request ID', value: request.id, code: true },
  ]
}

// Request logs come from the HTTP proxy, connection logs from the instancer's
// TCP proxy; each section shows only where it can have entries.
export function hasHttpEndpoint(instance: AdminInstance): boolean {
  return instance.endpoints.some(
    endpoint =>
      endpoint.kind === ExposeKind.HTTP || endpoint.kind === ExposeKind.HTTPS
  )
}

export function hasTcpEndpoint(instance: AdminInstance): boolean {
  return instance.endpoints.some(
    endpoint =>
      endpoint.kind === ExposeKind.TCP || endpoint.kind === ExposeKind.TCP_SSL
  )
}

export function decodeChunk(data: string): Uint8Array {
  try {
    return Uint8Array.from(atob(data), char => char.charCodeAt(0))
  } catch {
    return new Uint8Array()
  }
}

const hexByte = (byte: number) => byte.toString(16).padStart(2, '0')

// Bytes as readable text: printable ASCII as is, newlines and tabs kept, and
// anything else, backslashes included, escaped as \xNN so nothing is hidden.
export function renderText(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) {
    if (byte === 0x0a || byte === 0x09) out += String.fromCharCode(byte)
    else if (byte === 0x5c) out += '\\\\'
    else if (byte >= 0x20 && byte < 0x7f) out += String.fromCharCode(byte)
    else out += `\\x${hexByte(byte)}`
  }
  return out
}

// Bytes as a hex dump, 16 a line: offset, hex, then the printable characters.
export function renderHex(bytes: Uint8Array): string {
  const lines: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.subarray(offset, offset + 16)
    const hex = Array.from(row, hexByte).join(' ').padEnd(47, ' ')
    const ascii = Array.from(row, byte =>
      byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.'
    ).join('')
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`)
  }
  return lines.join('\n')
}

export type TranscriptMode = 'text' | 'hex'

export function renderChunk(chunk: TranscriptChunk, mode: TranscriptMode) {
  const bytes = decodeChunk(chunk.data)
  return mode === 'hex' ? renderHex(bytes) : renderText(bytes)
}

// "+1.20s", how long after the connection opened a chunk was sent.
export function formatOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(2)}s`
}

// The whole transcript as plain text, for copying: each chunk under a line
// saying who sent it and when.
export function transcriptToText(
  session: InstanceSession,
  mode: TranscriptMode
): string {
  return session.transcript
    .map(
      chunk =>
        `${chunk.dir === 'in' ? '>>> client' : '<<< challenge'} ${formatOffset(chunk.t)}\n${renderChunk(chunk, mode)}`
    )
    .join('\n\n')
}

// Everything kept about one connection, for its expanded row. `localTime` is
// its start already formatted for the viewer.
export function sessionDetails(
  session: InstanceSession,
  localTime: string
): RequestDetail[] {
  const at = Date.parse(session.startedAt)
  const utc = Number.isNaN(at) ? session.startedAt : new Date(at).toISOString()
  const bytes = (count: number) =>
    count < 1024
      ? formatBytes(count)
      : `${formatBytes(count)} (${count.toLocaleString('en-US')} bytes)`
  return [
    { label: 'Opened', value: localTime },
    { label: 'Opened (UTC)', value: utc, code: true },
    { label: 'Client IP', value: session.clientIp, code: true },
    { label: 'Host', value: session.host, code: true },
    {
      label: 'Duration',
      value: `${formatDurationMs(session.durationMs)}${session.open ? ' so far, still open' : ''}`,
    },
    { label: 'Client sent', value: bytes(session.bytesIn) },
    { label: 'Challenge sent', value: bytes(session.bytesOut) },
    ...(session.truncated
      ? [
          {
            label: 'Transcript',
            value: 'Only the start of each direction is kept',
          },
        ]
      : []),
    ...(session.error ? [{ label: 'Error', value: session.error }] : []),
    { label: 'Connection ID', value: session.id, code: true },
  ]
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`

// What reached an instance: "12 requests", "3 connections", or both.
export function activitySummary(instance: AdminInstance): string {
  const parts: string[] = []
  if (instance.requestCount > 0 || hasHttpEndpoint(instance)) {
    parts.push(plural(instance.requestCount, 'request'))
  }
  if (instance.sessionCount > 0 || hasTcpEndpoint(instance)) {
    parts.push(plural(instance.sessionCount, 'connection'))
  }
  return parts.length > 0 ? parts.join(', ') : plural(0, 'request')
}
