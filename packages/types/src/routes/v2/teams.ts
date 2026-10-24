import { z } from 'zod/mini'
import { defineRoute } from '../../internal'
import {
  BadAlreadyInTeam,
  BadBody,
  BadDiscordCode,
  BadDiscordGuild,
  BadDivisionNotAllowed,
  BadEndpoint,
  BadKnownName,
  BadName,
  BadNoTeam,
  BadNotCaptain,
  BadRosterLocked,
  BadTeamBanned,
  BadTeamCreationClosed,
  BadTeamFull,
  BadTeamToken,
  BadToken,
  BadUnknownPlayer,
  GoodDiscordLogin,
  GoodPlayerSelf,
  GoodTeamCaptainTransfer,
  GoodTeamCreate,
  GoodTeamJoin,
  GoodTeamLeave,
  GoodTeamMemberRemove,
  GoodTeamMembers,
  GoodTeamTokenRotate,
} from '../../responses'
import { UserName } from '../../util'
import { example } from '../../util/example'

export const DiscordLoginRouteV2 = defineRoute({
  path: '/v2/auth/discord',
  method: 'POST',
  body: z.object({
    code: example(z.string().check(z.minLength(1)), '<discord-code>').check(
      z.describe('Authorization code Discord returned to the redirect URI.')
    ),
    redirectUri: example(
      z.string(),
      'https://rctf.osec.io/login/discord'
    ).check(z.describe('Redirect URI used for the authorization request.')),
  }),
  goodResponses: [GoodDiscordLogin],
  badResponses: [BadEndpoint, BadBody, BadDiscordCode, BadDiscordGuild],
})

export const GetPlayerSelfRouteV2 = defineRoute({
  path: '/v2/players/me',
  method: 'GET',
  goodResponses: [GoodPlayerSelf],
  badResponses: [BadToken],
  playerAuth: true,
  optionalAuth: true,
})

export const CreateTeamRouteV2 = defineRoute({
  path: '/v2/teams',
  method: 'POST',
  body: z.object({
    name: UserName,
    division: z.optional(
      z.string().check(z.describe('Division for the team.'))
    ),
  }),
  goodResponses: [GoodTeamCreate],
  badResponses: [
    BadToken,
    BadName,
    BadKnownName,
    BadAlreadyInTeam,
    BadDivisionNotAllowed,
    BadTeamCreationClosed,
  ],
  playerAuth: true,
  optionalAuth: true,
})

export const JoinTeamRouteV2 = defineRoute({
  path: '/v2/teams/join',
  method: 'POST',
  body: z.object({
    token: example(z.string().check(z.minLength(1)), '<join-token>').check(
      z.describe("The team's join token, shared by its captain.")
    ),
  }),
  goodResponses: [GoodTeamJoin],
  badResponses: [
    BadToken,
    BadAlreadyInTeam,
    BadTeamToken,
    BadTeamFull,
    BadTeamBanned,
  ],
  playerAuth: true,
  optionalAuth: true,
})

export const GetTeamMembersRouteV2 = defineRoute({
  path: '/v2/teams/me/members',
  method: 'GET',
  goodResponses: [GoodTeamMembers],
  badResponses: [BadToken, BadNoTeam],
  playerAuth: true,
  optionalAuth: true,
})

export const LeaveTeamRouteV2 = defineRoute({
  path: '/v2/teams/me/leave',
  method: 'POST',
  goodResponses: [GoodTeamLeave],
  badResponses: [BadToken, BadNoTeam, BadRosterLocked],
  playerAuth: true,
  optionalAuth: true,
})

export const RemoveTeamMemberRouteV2 = defineRoute({
  path: '/v2/teams/me/members/:playerId',
  method: 'DELETE',
  params: z.object({
    playerId: z.string().check(z.describe('Player ID to remove.')),
  }),
  goodResponses: [GoodTeamMemberRemove],
  badResponses: [
    BadToken,
    BadNoTeam,
    BadNotCaptain,
    BadRosterLocked,
    BadUnknownPlayer,
  ],
  playerAuth: true,
  optionalAuth: true,
})

export const TransferTeamCaptainRouteV2 = defineRoute({
  path: '/v2/teams/me/captain',
  method: 'POST',
  body: z.object({
    playerId: z.string().check(z.describe('Player ID of the new captain.')),
  }),
  goodResponses: [GoodTeamCaptainTransfer],
  badResponses: [BadToken, BadNoTeam, BadNotCaptain, BadUnknownPlayer],
  playerAuth: true,
  optionalAuth: true,
})

export const RotateTeamTokenRouteV2 = defineRoute({
  path: '/v2/teams/me/token',
  method: 'POST',
  goodResponses: [GoodTeamTokenRotate],
  badResponses: [BadToken, BadNoTeam, BadNotCaptain],
  playerAuth: true,
  optionalAuth: true,
})
