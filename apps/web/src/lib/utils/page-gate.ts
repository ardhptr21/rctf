import { AccessControlledPage, PageAccess } from '@rctf/types'
import { ADMIN_PANEL_PERMISSIONS, hasAnyPermission } from './permissions'

export type PageGate = 'loggedOut' | 'noPerms' | 'noTeam' | 'banned' | 'ok'

export type PageGateOptions = {
  page?: `${AccessControlledPage}`
  // a Discord player is signed in but has not joined a team yet
  noTeam?: boolean
}

export function decidePageGate(
  access: PageAccess | undefined,
  user:
    | { perms: number | null | undefined; banned?: boolean | null }
    | undefined
    | null,
  { page, noTeam = false }: PageGateOptions = {}
): PageGate {
  // mirrors the API: challenges always need a team, and so does any page
  // that needs a login
  if (
    noTeam &&
    (page === AccessControlledPage.Challenges ||
      (access !== undefined && access !== PageAccess.Public))
  ) {
    return 'noTeam'
  }
  // mirrors the API: a banned team can't see challenges, admins still can
  if (
    page === AccessControlledPage.Challenges &&
    user?.banned &&
    !hasAnyPermission(user, ADMIN_PANEL_PERMISSIONS)
  ) {
    return 'banned'
  }
  if (access === undefined || access === PageAccess.Public) {
    return 'ok'
  }
  if (user === null || user === undefined) {
    return 'loggedOut'
  }
  if (access === PageAccess.Admin) {
    return hasAnyPermission(user, ADMIN_PANEL_PERMISSIONS) ? 'ok' : 'noPerms'
  }
  return 'ok'
}
