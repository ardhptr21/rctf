import { defineCommand } from 'citty'
import { withDbAndRedis } from '../../lib/context'

export default defineCommand({
  meta: {
    name: 'token',
    description:
      "Print a team login token, such as Konata's teamToken for an admin team",
  },
  args: {
    target: {
      type: 'positional',
      description: "Team email, team name, or a team member's Discord ID",
      required: true,
    },
  },
  run: async ({ args }) => {
    const { config } = await import('@rctf/config')

    const team = await withDbAndRedis(async ({ db }) => {
      const { resolveTeamTarget } = await import('@rctf/api/src/services/teams')
      return await resolveTeamTarget(db, args.target)
    })
    if (!team) {
      console.error(`No team found for '${args.target}'`)
      process.exit(1)
    }

    const { isAdminUser } = await import('@rctf/api/src/services/settings')
    // with Discord login, only admin teams can log in with a team token
    if (config.discord && !isAdminUser(team)) {
      console.error(
        `${team.name} is not an admin team; with Discord login, only admin teams can log in with a token`
      )
      process.exit(1)
    }

    const { createToken, TokenKind } = await import('@rctf/api/src/lib/tokens')
    console.log(
      `Login token for ${team.name} (${team.id}): ${await createToken(TokenKind.Team, team.id)}`
    )
    console.log(
      'It never expires and gives full access to the team. Keep it secret.'
    )
  },
})
