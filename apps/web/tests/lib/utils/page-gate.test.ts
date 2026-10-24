import { PageAccess, Permissions } from '@rctf/types'
import { decidePageGate } from '$lib/utils/page-gate'
import { describe, expect, it } from 'bun:test'

const player = { perms: 0 }
const admin = { perms: Permissions.challsRead }

describe('decidePageGate', () => {
  it('lets everyone through a public page', () => {
    expect(decidePageGate(PageAccess.Public, null)).toBe('ok')
    expect(decidePageGate(undefined, null)).toBe('ok')
  })

  it('requires a login for a private page', () => {
    expect(decidePageGate(PageAccess.Private, null)).toBe('loggedOut')
    expect(decidePageGate(PageAccess.Private, player)).toBe('ok')
  })

  it('requires admin permissions for an admin page', () => {
    expect(decidePageGate(PageAccess.Admin, null)).toBe('loggedOut')
    expect(decidePageGate(PageAccess.Admin, player)).toBe('noPerms')
    expect(decidePageGate(PageAccess.Admin, admin)).toBe('ok')
  })
})
