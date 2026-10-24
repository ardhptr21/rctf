import { defineCommand } from 'citty'
import { withDbAndRedis } from '../../lib/context'

export default defineCommand({
  meta: {
    name: 'demote',
    description: 'Revoke all admin permissions from a user',
  },
  args: {
    target: {
      type: 'positional',
      description: "Team email, team name, or a team member's Discord ID",
      required: true,
    },
  },
  run: async ({ args }) => {
    const updated = await withDbAndRedis(async ({ db, redis }) => {
      const { setUserPerms } = await import('@rctf/api/src/services/users')
      const { resolveTeamTarget } = await import('@rctf/api/src/services/teams')

      const user = await resolveTeamTarget(db, args.target)
      if (!user) {
        return undefined
      }

      return await setUserPerms(db, redis, user.id, 0)
    })

    if (!updated) {
      console.error(`No team found for '${args.target}'`)
      process.exit(1)
    }

    console.log(`Demoted ${updated.name} (${updated.id})`)
  },
})
