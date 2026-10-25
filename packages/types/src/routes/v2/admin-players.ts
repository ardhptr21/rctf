import { z } from 'zod/mini'
import { Permissions } from '../../enums/permissions'
import { defineRoute } from '../../internal'
import {
  BadBody,
  BadPerms,
  BadPlayerAlreadyInTeam,
  BadPlayerBanned,
  BadPlayerNoTeam,
  BadPlayerNotFound,
  BadTeamBanned,
  BadTeamFull,
  BadToken,
  BadUnknownUser,
  GoodAdminPlayerDelete,
  GoodAdminPlayers,
  GoodAdminPlayerUpdate,
} from '../../responses'
import { example } from '../../util/example'

export enum AdminPlayerRole {
  CAPTAIN = 'captain',
  MEMBER = 'member',
  NO_TEAM = 'noTeam',
}

export enum AdminPlayerStatus {
  ACTIVE = 'active',
  BANNED = 'banned',
}

// a comma-separated list in the query string
const commaList = <T extends Record<string, string>>(values: T) =>
  z.pipe(
    z.pipe(
      z.string(),
      z.transform((value: string) => value.split(','))
    ),
    z.array(z.enum(values))
  )

const AdminPlayerParams = z.object({
  id: example(z.string(), 'player-1a2b3c').check(z.describe('Player ID.')),
})

export const GetAdminPlayersRouteV2 = defineRoute({
  path: '/v2/admin/players',
  method: 'GET',
  query: z.object({
    limit: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(1))
      .check(z.lte(100))
      .check(z.describe('Integer `1`-`100`. Page size.')),
    offset: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(0))
      .check(z.describe('Integer `>= 0`. Page offset.')),
    search: example(
      z.optional(z.string().check(z.minLength(1)).check(z.maxLength(100))),
      'nelly'
    ).check(
      z.describe(
        'Free-text search over Discord username, display name, Discord ID and team name.'
      )
    ),
    roles: example(z.optional(commaList(AdminPlayerRole)), [
      'captain',
      'noTeam',
    ]).check(
      z.describe(
        'Comma-separated roles to include: `captain`, `member` and `noTeam`. All roles when omitted.'
      )
    ),
    statuses: example(z.optional(commaList(AdminPlayerStatus)), [
      'banned',
    ]).check(
      z.describe(
        'Comma-separated statuses to include: `active` and `banned`. Both when omitted.'
      )
    ),
  }),
  goodResponses: [GoodAdminPlayers],
  badResponses: [BadBody, BadPerms, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const SetAdminPlayerTeamRouteV2 = defineRoute({
  path: '/v2/admin/players/:id/team',
  method: 'PUT',
  params: AdminPlayerParams,
  body: z.object({
    teamId: example(z.nullable(z.string()), 'team-1a2b3c').check(
      z.describe(
        'Team to move the player to, or `null` to remove them from their team.'
      )
    ),
  }),
  goodResponses: [GoodAdminPlayerUpdate],
  badResponses: [
    BadBody,
    BadPerms,
    BadPlayerAlreadyInTeam,
    BadPlayerNoTeam,
    BadPlayerNotFound,
    BadTeamBanned,
    BadTeamFull,
    BadToken,
    BadUnknownUser,
  ],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const MakeAdminPlayerCaptainRouteV2 = defineRoute({
  path: '/v2/admin/players/:id/captain',
  method: 'POST',
  params: AdminPlayerParams,
  goodResponses: [GoodAdminPlayerUpdate],
  badResponses: [
    BadBody,
    BadPerms,
    BadPlayerNoTeam,
    BadPlayerNotFound,
    BadToken,
  ],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const SetAdminPlayerBannedRouteV2 = defineRoute({
  path: '/v2/admin/players/:id/ban',
  method: 'PUT',
  params: AdminPlayerParams,
  body: z.object({
    banned: example(z.boolean(), true).check(
      z.describe('`true` to ban the player, `false` to unban them.')
    ),
  }),
  goodResponses: [GoodAdminPlayerUpdate],
  badResponses: [BadBody, BadPerms, BadPlayerNotFound, BadToken],
  authRequired: true,
  permissions: Permissions.usersWrite,
})

export const DeleteAdminPlayerRouteV2 = defineRoute({
  path: '/v2/admin/players/:id',
  method: 'DELETE',
  params: AdminPlayerParams,
  goodResponses: [GoodAdminPlayerDelete],
  badResponses: [
    BadBody,
    BadPerms,
    BadPlayerBanned,
    BadPlayerNotFound,
    BadToken,
  ],
  authRequired: true,
  permissions: Permissions.usersWrite,
})
