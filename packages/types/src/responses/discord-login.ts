import { z } from 'zod/mini'
import { response } from '../internal'
import { example } from '../util/example'

export const GoodDiscordLogin = response('goodDiscordLogin', {
  status: 200,
  message: 'The Discord login was successful.',
  data: z.object({
    authToken: example(z.string(), '<auth-token>').check(
      z.describe('Player auth token to send as a bearer token.')
    ),
  }),
})

export const BadDiscordCode = response('badDiscordCode', {
  status: 401,
  message: 'The Discord authorization code is invalid.',
})

export const BadDiscordGuild = response('badDiscordGuild', {
  status: 403,
  message: 'You must be a member of the CTF Discord server to log in.',
})
