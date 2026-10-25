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

describe('decidePageGate for players without a team', () => {
  const noTeam = { noTeam: true }

  it('blocks challenges even when the page is public', () => {
    expect(
      decidePageGate(PageAccess.Public, null, { ...noTeam, page: 'challenges' })
    ).toBe('noTeam')
    expect(
      decidePageGate(PageAccess.Private, null, {
        ...noTeam,
        page: 'challenges',
      })
    ).toBe('noTeam')
  })

  it('allows a public scoreboard but not a private one', () => {
    expect(
      decidePageGate(PageAccess.Public, null, { ...noTeam, page: 'scores' })
    ).toBe('ok')
    expect(
      decidePageGate(PageAccess.Private, null, { ...noTeam, page: 'scores' })
    ).toBe('noTeam')
  })

  it('lets team members and logged-out visitors through as before', () => {
    expect(
      decidePageGate(PageAccess.Public, player, { page: 'challenges' })
    ).toBe('ok')
    expect(
      decidePageGate(PageAccess.Public, null, { page: 'challenges' })
    ).toBe('ok')
  })
})

describe('decidePageGate for banned teams', () => {
  const banned = { perms: 0, banned: true }

  it('blocks the challenges page whatever its access setting', () => {
    for (const access of [
      PageAccess.Public,
      PageAccess.Private,
      PageAccess.Admin,
    ]) {
      expect(decidePageGate(access, banned, { page: 'challenges' })).toBe(
        'banned'
      )
    }
  })

  it('leaves other pages alone and lets banned admins through', () => {
    expect(decidePageGate(PageAccess.Public, banned, { page: 'scores' })).toBe(
      'ok'
    )
    expect(
      decidePageGate(
        PageAccess.Public,
        { perms: Permissions.challsRead, banned: true },
        { page: 'challenges' }
      )
    ).toBe('ok')
  })
})
