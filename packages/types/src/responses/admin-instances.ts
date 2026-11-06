import { z } from 'zod/mini'
import { InstanceHistoryStatus } from '../enums/instance-history'
import { response } from '../internal'
import { example } from '../util/example'
import { ExposeKind } from '../util/schemas'

const AdminInstanceSchema = z.object({
  id: example(z.string(), 'instance-1a2b3c').check(
    z.describe('History entry ID.')
  ),
  team: z.object({
    id: example(z.string(), 'team-1a2b3c').check(z.describe('Team ID.')),
    name: example(z.string(), 'otter-sec').check(z.describe('Team name.')),
    avatarUrl: example(z.nullable(z.string()), null).check(
      z.describe('Team avatar URL, or `null`.')
    ),
  }),
  player: z
    .nullable(
      z.object({
        id: example(z.string(), 'player-1a2b3c').check(
          z.describe('Player ID.')
        ),
        name: example(z.nullable(z.string()), 'Nelly').check(
          z.describe(
            'Discord display name or username, or `null` once the player is deleted.'
          )
        ),
        username: example(z.nullable(z.string()), 'nelly').check(
          z.describe('Discord username, or `null` once the player is deleted.')
        ),
      })
    )
    .check(
      z.describe('The player who started it, or `null` for a team token.')
    ),
  challenge: z.object({
    id: example(z.string(), 'web-notes').check(z.describe('Challenge ID.')),
    name: example(z.string(), 'Notes').check(z.describe('Challenge name.')),
    category: example(z.string(), 'web').check(
      z.describe('Challenge category.')
    ),
  }),
  status: example(z.enum(InstanceHistoryStatus), 'expired').check(
    z.describe('Whether it is running, or how it ended.')
  ),
  startedAt: example(z.string(), '2026-05-05T10:00:00.000Z').check(
    z.describe('When it was started.')
  ),
  endedAt: example(z.nullable(z.string()), '2026-05-05T10:30:00.000Z').check(
    z.describe(
      'When it ended, or `null` while it runs. An instance that ran out of time ended at its expiry.'
    )
  ),
  expiresAt: example(z.nullable(z.string()), '2026-05-05T10:30:00.000Z').check(
    z.describe('When its time runs out, or `null` without a time limit.')
  ),
  extendCount: example(z.int(), 1).check(
    z.describe('How many times it was extended.')
  ),
  ip: example(z.string(), '203.0.113.42').check(
    z.describe('IP address it was started from.')
  ),
  endpoints: z
    .array(
      z.object({
        kind: example(z.enum(ExposeKind), 'https').check(
          z.describe('Exposure protocol.')
        ),
        host: example(z.string(), 'web-3f9c1a.inst.example.com').check(
          z.describe('Hostname handed out.')
        ),
        port: example(z.int(), 443).check(z.describe('Port.')),
      })
    )
    .check(z.describe('Where the instance was reachable.')),
  requestCount: example(z.int(), 1204).check(
    z.describe('HTTP requests that reached it, including ones no longer kept.')
  ),
  sessionCount: example(z.int(), 7).check(
    z.describe(
      'TCP connections to its tcp-ssl endpoints, including ones no longer kept.'
    )
  ),
})

export const GoodAdminInstances = response('goodAdminInstances', {
  status: 200,
  message: 'The instance history was retrieved.',
  data: z.object({
    total: example(z.int(), 42).check(
      z.describe('Instances matching the filters.')
    ),
    teams: example(z.int(), 12).check(
      z.describe('Teams with at least one matching instance.')
    ),
    categories: z
      .array(
        z.object({
          category: example(z.string(), 'web').check(
            z.describe('Challenge category.')
          ),
          count: example(z.int(), 30).check(
            z.describe('Matching instances in it.')
          ),
        })
      )
      .check(z.describe('Matching instances per category, most first.')),
    instances: z
      .array(AdminInstanceSchema)
      .check(z.describe('This page of instances, newest first.')),
  }),
})

export const GoodInstanceRequestsIngest = response(
  'goodInstanceRequestsIngest',
  {
    status: 200,
    message: 'The requests were recorded.',
    data: z.object({
      stored: example(z.int(), 940).check(
        z.describe('Requests matched to an instance and stored.')
      ),
      unmatched: example(z.int(), 58).check(
        z.describe(
          'Requests to no recorded instance: unknown hosts, admin teams, or outside the instance lifetime.'
        )
      ),
      invalid: example(z.int(), 2).check(
        z.describe('Entries that are not Traefik HTTP access log lines.')
      ),
    }),
  }
)

export const GoodInstanceSessionsIngest = response(
  'goodInstanceSessionsIngest',
  {
    status: 200,
    message: 'The connections were recorded.',
    data: z.object({
      stored: example(z.int(), 40).check(
        z.describe('Connections matched to an instance and stored or updated.')
      ),
      unmatched: example(z.int(), 1).check(
        z.describe(
          'Connections to no recorded instance: unknown hosts, admin teams, or outside the instance lifetime.'
        )
      ),
      invalid: example(z.int(), 0).check(
        z.describe('Entries that are not tcplog connection records.')
      ),
    }),
  }
)

export const BadUnknownInstance = response('badUnknownInstance', {
  status: 404,
  message: 'The instance could not be found.',
})

export const GoodAdminInstance = response('goodAdminInstance', {
  status: 200,
  message: 'The instance was retrieved.',
  data: z.object({
    instance: AdminInstanceSchema,
    requests: z.object({
      total: example(z.int(), 5312).check(
        z.describe('Every HTTP request that reached it.')
      ),
      kept: example(z.int(), 2000).check(
        z.describe('Requests still stored; older ones are dropped.')
      ),
      firstAt: example(
        z.nullable(z.string()),
        '2026-05-05T10:00:03.000Z'
      ).check(z.describe('The first request, or `null` without any.')),
      lastAt: example(z.nullable(z.string()), '2026-05-05T10:29:58.000Z').check(
        z.describe('The latest request, or `null` without any.')
      ),
      uniqueIps: example(z.int(), 3).check(
        z.describe('Client IPs among the kept requests.')
      ),
      statusClasses: z
        .object({
          '2xx': z.int(),
          '3xx': z.int(),
          '4xx': z.int(),
          '5xx': z.int(),
        })
        .check(z.describe('Kept requests per response status class.')),
    }),
    sessions: z.object({
      total: example(z.int(), 7).check(
        z.describe('Every TCP connection to it.')
      ),
      kept: example(z.int(), 7).check(
        z.describe('Connections still stored; older ones are dropped.')
      ),
      lastAt: example(z.nullable(z.string()), '2026-05-05T10:21:40.000Z').check(
        z.describe('When the latest connection opened, or `null` without any.')
      ),
      uniqueIps: example(z.int(), 2).check(
        z.describe('Client IPs among the kept connections.')
      ),
    }),
  }),
})

export const GoodAdminInstanceRequests = response('goodAdminInstanceRequests', {
  status: 200,
  message: 'The requests were retrieved.',
  data: z.object({
    total: example(z.int(), 120).check(
      z.describe('Kept requests matching the filters.')
    ),
    requests: z
      .array(
        z.object({
          id: example(z.string(), '981').check(z.describe('Request ID.')),
          at: example(z.string(), '2026-05-05T10:12:00.000Z').check(
            z.describe('When it was made.')
          ),
          clientIp: example(z.string(), '203.0.113.42').check(
            z.describe('Client IP address.')
          ),
          method: example(z.string(), 'GET').check(z.describe('HTTP method.')),
          host: example(z.string(), 'web-3f9c1a.inst.example.com').check(
            z.describe('Hostname requested.')
          ),
          path: example(z.string(), '/notes?id=1').check(
            z.describe('Path with its query string.')
          ),
          status: example(z.int(), 200).check(z.describe('Response status.')),
          bytes: example(z.int(), 5120).check(
            z.describe('Response size in bytes.')
          ),
          durationMs: example(z.int(), 12).check(
            z.describe('Time to respond, in milliseconds.')
          ),
          userAgent: example(z.nullable(z.string()), 'curl/8.5.0').check(
            z.describe('User-Agent header, or `null`.')
          ),
        })
      )
      .check(z.describe('This page of requests, newest first.')),
  }),
})

export const GoodAdminInstanceSessions = response('goodAdminInstanceSessions', {
  status: 200,
  message: 'The connections were retrieved.',
  data: z.object({
    total: example(z.int(), 7).check(
      z.describe('Kept connections matching the filters.')
    ),
    sessions: z
      .array(
        z.object({
          id: example(z.string(), '311').check(z.describe('Connection ID.')),
          startedAt: example(z.string(), '2026-05-05T10:12:00.000Z').check(
            z.describe('When it opened.')
          ),
          durationMs: example(z.int(), 8400).check(
            z.describe(
              'How long it lasted, or has lasted so far, in milliseconds.'
            )
          ),
          open: example(z.boolean(), false).check(
            z.describe('Whether it was still open at the last report.')
          ),
          clientIp: example(z.string(), '203.0.113.42').check(
            z.describe('Client IP address.')
          ),
          host: example(z.string(), 'pwn-3f9c1a.inst.example.com').check(
            z.describe('Hostname connected to.')
          ),
          bytesIn: example(z.int(), 31).check(
            z.describe('Bytes the client sent.')
          ),
          bytesOut: example(z.int(), 412).check(
            z.describe('Bytes the challenge sent back.')
          ),
          truncated: example(z.boolean(), false).check(
            z.describe(
              'Whether the transcript stops early: only the start of each direction is kept.'
            )
          ),
          error: example(z.nullable(z.string()), null).check(
            z.describe(
              'Why it ended abnormally, such as the challenge being unreachable, or `null`.'
            )
          ),
          transcript: z
            .array(
              z.object({
                dir: example(z.enum(['in', 'out']), 'in').check(
                  z.describe(
                    '`in` for what the client sent, `out` for what the challenge answered.'
                  )
                ),
                t: example(z.int(), 1200).check(
                  z.describe('Milliseconds after the connection opened.')
                ),
                data: example(z.string(), 'ZmxhZwo=').check(
                  z.describe('The bytes, base64-encoded.')
                ),
              })
            )
            .check(z.describe('What was sent each way, in order.')),
        })
      )
      .check(z.describe('This page of connections, newest first.')),
  }),
})
