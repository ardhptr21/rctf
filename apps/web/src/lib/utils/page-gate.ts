import { PageAccess } from '@rctf/types'
import { ADMIN_PANEL_PERMISSIONS, hasAnyPermission } from './permissions'

export type PageGate = 'loggedOut' | 'noPerms' | 'ok'

export function decidePageGate(
  access: PageAccess | undefined,
  user: { perms: number | null | undefined } | undefined | null
): PageGate {
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
