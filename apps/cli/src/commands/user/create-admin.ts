import { ALL_PERMISSIONS, normalizeEmail, UserName } from '@rctf/types'
import { defineCommand } from 'citty'
import { withDbAndRedis } from '../../lib/context'
import { formatPerms, parsePermsList } from '../../lib/perms'

const errorMessages = {
  badKnownName: 'A team with that name already exists',
  badKnownEmail: 'A team with that email already exists',
  badAlreadyInTeam: 'That Discord account is already on a team',
} as const

export default defineCommand({
  meta: {
    name: 'create-admin',
    description: 'Create a new team with admin permissions',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Name of the new admin team',
      required: true,
    },
    'discord-id': {
      type: 'string',
      description:
        'Discord user ID to add as the team captain (Discord login only)',
    },
    email: {
      type: 'string',
      description: 'Team email (legacy team login only)',
    },
    division: {
      type: 'string',
      description: 'Division for the team (defaults to the default division)',
    },
    perms: {
      type: 'string',
      description:
        'Comma-separated permission names (defaults to all permissions)',
    },
  },
  run: async ({ args }) => {
    const { config } = await import('@rctf/config')

    const name = UserName.safeParse(args.name)
    if (!name.success) {
      console.error('Team name must be 2-64 printable characters')
      process.exit(1)
    }
    const discordId = args['discord-id']?.trim()
    if (discordId && !/^\d{15,21}$/.test(discordId)) {
      console.error(`'${discordId}' is not a Discord user ID`)
      process.exit(1)
    }
    if (args.division && !Object.hasOwn(config.divisions, args.division)) {
      console.error(
        `Unknown division '${args.division}'. Available: ${Object.keys(config.divisions).join(', ')}`
      )
      process.exit(1)
    }
    const perms = args.perms ? parsePermsList(args.perms) : ALL_PERMISSIONS

    const result = await withDbAndRedis(async ({ db, redis }) => {
      const { createAdminTeam } = await import('@rctf/api/src/services/teams')
      return await createAdminTeam(db, redis, {
        name: name.data,
        perms,
        division: args.division,
        email: args.email ? normalizeEmail(args.email) : undefined,
        discordId,
      })
    })

    if (!result.ok) {
      console.error(errorMessages[result.error])
      process.exit(1)
    }

    const { team } = result
    console.log(
      `Created admin team ${team.name} (${team.id}): ${formatPerms(team.perms)}`
    )

    if (config.discord) {
      if (result.playerAttached) {
        console.log(
          `Discord user ${discordId} is the captain. Log in with Discord to use it.`
        )
      }
      console.log(`Team token for other organizers: ${result.joinToken}`)
      console.log(
        'They join from the Team page after logging in with Discord. Admin teams have no size limit.'
      )
      return
    }

    // legacy team login: hand out a login link for the whole team
    const { createToken, TokenKind } = await import('@rctf/api/src/lib/tokens')
    const loginToken = await createToken(TokenKind.Team, team.id)
    const loginUrl = new URL('/login', config.origin)
    loginUrl.searchParams.set('token', loginToken)
    console.log(`Login URL: ${loginUrl.toString()}`)
  },
})
