import { BadEndpoint } from './bad-endpoint'
import { BadPerms } from './bad-perms'
import { BadToken } from './bad-token'
import { BadNoTeam, BadNotCaptain } from './teams'

// Responses the API router can return for any route before its handler runs
// (auth, permissions, team membership, disabled legacy auth), whether or not
// the route lists them.
export const ROUTER_RESPONSES = [
  BadToken,
  BadPerms,
  BadNoTeam,
  BadNotCaptain,
  BadEndpoint,
] as const
