import { createModules } from '../../lib/route-module'
import adminGroup from './admin'
import authGroup from './auth'
import challsGroup from './challs'
import externalAuthGroup from './external-auth'
import integrationsGroup from './integrations'
import leaderboardGroup from './leaderboard'
import teamsGroup from './teams'
import usersGroup from './users'

export default [
  ...createModules(adminGroup),
  ...createModules(authGroup),
  ...createModules(usersGroup),
  ...createModules(teamsGroup),
  ...createModules(leaderboardGroup),
  ...createModules(challsGroup),
  ...createModules(integrationsGroup),
  ...createModules(externalAuthGroup),
]
