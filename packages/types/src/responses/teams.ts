import { z } from 'zod/mini'
import { response } from '../internal'
import { example } from '../util/example'

const TeamSummarySchema = z.object({
  id: example(z.string(), 'team-1a2b3c').check(z.describe('Team ID.')),
  name: example(z.string(), 'otter-sec').check(z.describe('Team name.')),
  division: example(z.string(), 'open').check(z.describe('Team division.')),
})

export const PlayerSchema = z.object({
  id: example(z.string(), 'player-1a2b3c').check(z.describe('Player ID.')),
  discordId: example(z.string(), '80351110224678912').check(
    z.describe('Discord user ID.')
  ),
  discordUsername: example(z.string(), 'nelly').check(
    z.describe('Discord username.')
  ),
  displayName: example(z.nullable(z.string()), 'Nelly').check(
    z.describe('Discord display name, or `null` when unset.')
  ),
  avatarUrl: example(
    z.nullable(z.string()),
    'https://cdn.discordapp.com/avatars/80351110224678912/abc.png'
  ).check(z.describe('Discord avatar URL, or `null` when unset.')),
  isCaptain: example(z.boolean(), true).check(
    z.describe('Whether the player is their team captain.')
  ),
})

export const GoodPlayerSelf = response('goodPlayerSelf', {
  status: 200,
  message: 'The player was retrieved.',
  data: z.object({
    player: PlayerSchema,
    team: z
      .nullable(TeamSummarySchema)
      .check(z.describe("The player's team, or `null` when not on a team.")),
    maxTeamSize: example(z.int(), 4).check(
      z.describe('Maximum number of players per team.')
    ),
    rosterLocked: example(z.boolean(), false).check(
      z.describe(
        'Whether the CTF has started, after which players can no longer leave or be removed.'
      )
    ),
  }),
})

export const GoodTeamCreate = response('goodTeamCreate', {
  status: 200,
  message: 'The team was created.',
  data: TeamSummarySchema,
})

export const GoodTeamJoin = response('goodTeamJoin', {
  status: 200,
  message: 'You joined the team.',
  data: TeamSummarySchema,
})

export const GoodTeamMembers = response('goodTeamMembers', {
  status: 200,
  message: 'The team members were retrieved.',
  data: z.object({
    members: z.array(
      z.object({
        ...PlayerSchema.shape,
        joinedAt: example(z.nullable(z.int()), 1710000000000).check(
          z.describe('When the player joined, as a Unix ms timestamp.')
        ),
      })
    ),
    maxTeamSize: example(z.nullable(z.int()), 4).check(
      z.describe('Member limit for this team, or `null` when unlimited.')
    ),
    joinToken: example(z.nullable(z.string()), '<join-token>').check(
      z.describe('Token other players use to join. Only shown to the captain.')
    ),
  }),
})

export const GoodTeamLeave = response('goodTeamLeave', {
  status: 200,
  message: 'You left the team.',
})

export const GoodTeamMemberRemove = response('goodTeamMemberRemove', {
  status: 200,
  message: 'The player was removed from the team.',
})

export const GoodTeamCaptainTransfer = response('goodTeamCaptainTransfer', {
  status: 200,
  message: 'Captaincy was transferred.',
})

export const GoodTeamTokenRotate = response('goodTeamTokenRotate', {
  status: 200,
  message: 'The join token was rotated.',
  data: z.object({
    joinToken: example(z.string(), '<join-token>').check(
      z.describe('The new join token.')
    ),
  }),
})

export const BadNoTeam = response('badNoTeam', {
  status: 403,
  message: 'Create or join a team first.',
})

export const BadAlreadyInTeam = response('badAlreadyInTeam', {
  status: 409,
  message: 'You are already on a team.',
})

export const BadTeamToken = response('badTeamToken', {
  status: 404,
  message: 'No team matches that token.',
})

export const BadTeamFull = response('badTeamFull', {
  status: 409,
  message: 'The team is full.',
})

export const BadTeamBanned = response('badTeamBanned', {
  status: 403,
  message: 'This team has been banned.',
})

export const BadNotCaptain = response('badNotCaptain', {
  status: 403,
  message: 'Only the team captain can do that.',
})

export const BadTeamCreationClosed = response('badTeamCreationClosed', {
  status: 403,
  message: 'Creating new teams is closed. Ask a captain for their team token.',
})

export const BadRosterLocked = response('badRosterLocked', {
  status: 409,
  message: 'Team rosters are locked once the CTF starts.',
})

export const BadUnknownPlayer = response('badUnknownPlayer', {
  status: 404,
  message: 'That player is not on your team.',
})
