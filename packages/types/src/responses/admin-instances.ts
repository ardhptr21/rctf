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
