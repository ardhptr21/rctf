import { z } from 'zod/mini'
import { response } from '../internal'
import { example } from '../util/example'
import { PlayerSchema } from './teams'

export const AdminPlayerSchema = z.object({
  ...PlayerSchema.shape,
  banned: example(z.boolean(), false).check(
    z.describe('Whether the player is banned from signing in.')
  ),
  team: z
    .nullable(
      z.object({
        id: example(z.string(), 'team-1a2b3c').check(z.describe('Team ID.')),
        name: example(z.string(), 'otter-sec').check(z.describe('Team name.')),
        isAdmin: example(z.boolean(), false).check(
          z.describe('Whether the team has admin permissions.')
        ),
        banned: example(z.boolean(), false).check(
          z.describe('Whether the team is banned.')
        ),
      })
    )
    .check(
      z.describe('The team the player is on, or `null` when they have none.')
    ),
  joinedTeamAt: example(z.nullable(z.int()), 1735689600000).check(
    z.describe(
      'When the player joined their team (Unix ms), or `null` without a team.'
    )
  ),
  createdAt: example(z.int(), 1735603200000).check(
    z.describe('When the player first signed in (Unix ms).')
  ),
})

export const GoodAdminPlayers = response('goodAdminPlayers', {
  status: 200,
  message: 'The players were retrieved.',
  data: z.object({
    players: z.array(AdminPlayerSchema),
    total: example(z.int(), 42).check(
      z.describe('Players matching the filters, across all pages.')
    ),
  }),
})

export const GoodAdminPlayerUpdate = response('goodAdminPlayerUpdate', {
  status: 200,
  message: 'The player was updated.',
  data: AdminPlayerSchema,
})

export const GoodAdminPlayerDelete = response('goodAdminPlayerDelete', {
  status: 200,
  message: 'The player was deleted.',
})

export const BadPlayerNotFound = response('badPlayerNotFound', {
  status: 404,
  message: 'No player has that ID.',
})

export const BadPlayerNoTeam = response('badPlayerNoTeam', {
  status: 409,
  message: 'That player is not on a team.',
})

export const BadPlayerBanned = response('badPlayerBanned', {
  status: 403,
  message: 'This Discord account has been banned from the CTF.',
})

export const BadPlayerAlreadyInTeam = response('badPlayerAlreadyInTeam', {
  status: 409,
  message: 'That player is already on this team.',
})
