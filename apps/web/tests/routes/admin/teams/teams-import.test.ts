import { parseTeamsCsv } from '@rctf/types'
import { describe, expect, it } from 'bun:test'
import {
  importTemplateCsv,
  joinCodesCsv,
  joinCodesFileName,
} from '$routes/admin/teams/teams-import'

describe('team import files', () => {
  it('writes a template the importer reads', () => {
    expect(parseTeamsCsv(importTemplateCsv('open')).rows).toEqual([
      { line: 2, name: 'Example Team', division: 'open' },
    ])
  })

  it('lists join codes with division labels, quoting where needed', () => {
    expect(
      joinCodesCsv(
        [
          { name: 'Comma, Inc', division: 'hs', joinToken: 'abc' },
          {
            name: 'Plain',
            division: 'unknown',
            banned: true,
            joinToken: null,
          },
        ],
        { hs: 'High School' }
      )
    ).toBe(
      'name,division,banned,join code\r\n"Comma, Inc",High School,no,abc\r\nPlain,unknown,yes,\r\n'
    )
  })

  it('names the file after the CTF', () => {
    expect(joinCodesFileName('My CTF 2026!')).toBe(
      'my-ctf-2026-team-join-codes.csv'
    )
    expect(joinCodesFileName('')).toBe('ctf-team-join-codes.csv')
  })
})
