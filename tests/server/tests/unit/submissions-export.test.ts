import {
  SubmissionKind,
  SubmissionResult,
  SubmissionSortBy,
  SubmissionSortOrder,
  SubmissionTeamStatus,
} from '@rctf/types'
import { describe, expect, test } from 'bun:test'
import ExcelJS from 'exceljs'
import type { AdminSubmissionInfo } from '../../../../apps/api/src/services/submissions'
import {
  buildSubmissionsWorkbook,
  describeFilters,
  describeSort,
  exportFileName,
  sheetName,
  SUMMARY_SHEET,
} from '../../../../apps/api/src/services/submissions-export'

const noNames = { challenges: new Map(), teams: new Map() }

const submission = (
  overrides: Partial<AdminSubmissionInfo>
): AdminSubmissionInfo => ({
  id: crypto.randomUUID(),
  kind: SubmissionKind.FLAG,
  challengeId: 'chall-a',
  challengeName: 'Alpha',
  challengeCategory: 'web',
  userId: 'team-a',
  userName: 'Team A',
  userDivision: 'open',
  userAvatarUrl: null,
  userCountryCode: null,
  userStatusText: null,
  userBanned: false,
  playerId: null,
  playerName: null,
  playerUsername: null,
  playerAvatarUrl: null,
  ip: '10.0.0.1',
  result: SubmissionResult.INCORRECT,
  cheatedFromId: null,
  cheatedFromName: null,
  details: { submittedFlag: 'flag{nope}' },
  relatedId: null,
  createdAt: '2026-05-05T10:00:00.000Z',
  ...overrides,
})

const readWorkbook = async (buffer: Buffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return workbook
}

const rowValues = (sheet: ExcelJS.Worksheet, row: number) =>
  (sheet.getRow(row).values as unknown[]).slice(1)

const info = {
  ctfName: 'Test CTF',
  generatedAt: new Date('2026-05-06T12:00:00.000Z'),
  filters: [],
  sort: 'By time, descending',
}

describe('sheetName', () => {
  test('joins category and name', () => {
    expect(sheetName('web', 'Alpha', new Set())).toBe('web - Alpha')
  })

  test('replaces characters Excel forbids', () => {
    expect(sheetName('pwn', 'a/b\\c[d]:e*f?g', new Set())).toBe(
      'pwn - a b c d e f g'
    )
  })

  test('strips leading and trailing apostrophes', () => {
    expect(sheetName("'misc", "quote'", new Set())).toBe('misc - quote')
  })

  test('keeps to 31 characters', () => {
    const name = sheetName(
      'crypto',
      'a very long challenge name indeed',
      new Set()
    )
    expect(name.length).toBeLessThanOrEqual(31)
    expect(name).toBe('crypto - a very long challenge')
  })

  test('makes duplicates unique, ignoring case', () => {
    const used = new Set<string>()
    expect(sheetName('web', 'Same', used)).toBe('web - Same')
    expect(sheetName('WEB', 'same', used)).toBe('WEB - same (2)')
    expect(sheetName('web', 'Same', used)).toBe('web - Same (3)')
  })

  test('shortens long duplicates to fit the suffix', () => {
    const used = new Set<string>()
    const long = 'x'.repeat(40)
    expect(sheetName('web', long, used).length).toBe(31)
    const second = sheetName('web', long, used)
    expect(second.length).toBe(31)
    expect(second.endsWith(' (2)')).toBe(true)
  })

  test('never takes the summary name', () => {
    // an empty category and name fall back to a generic name
    expect(sheetName('', '', new Set())).toBe('Challenge')
    expect(sheetName('', 'Alpha', new Set())).toBe('Alpha')
    const used = new Set<string>([SUMMARY_SHEET.toLowerCase()])
    expect(sheetName('a', 'b', used)).toBe('a - b')
  })
})

describe('export text', () => {
  test('names the file after the CTF and date', () => {
    expect(
      exportFileName('My CTF 2026!', new Date('2026-05-06T23:00:00.000Z'))
    ).toBe('my-ctf-2026-submissions-2026-05-06.xlsx')
    expect(exportFileName('!!!', new Date('2026-05-06T00:00:00.000Z'))).toBe(
      'ctf-submissions-2026-05-06.xlsx'
    )
  })

  test('describes filters with names', () => {
    expect(
      describeFilters(
        {
          challenge: { include: ['c1', 'missing'] },
          team: { exclude: ['t1'] },
          result: {
            include: [SubmissionResult.CORRECT, SubmissionResult.CHEATED],
          },
          kind: { exclude: [SubmissionKind.ADMIN_BOT] },
          teamStatus: { include: [SubmissionTeamStatus.BANNED] },
          createdAfter: '2026-05-05T10:00:00.000Z',
          teamSearch: 'alice',
        },
        {
          challenges: new Map([['c1', 'web/Alpha']]),
          teams: new Map([['t1', 'Team One']]),
        }
      )
    ).toEqual([
      'Challenge is web/Alpha, missing',
      'Team is not Team One',
      'Kind is not Admin bot',
      'Result is Correct, Cheated',
      'Team status is Banned',
      'From 2026-05-05T10:00:00.000Z (UTC)',
      'Team or player search "alice"',
    ])
    expect(describeFilters({}, noNames)).toEqual([])
  })

  test('describes the sort', () => {
    expect(describeSort({})).toBe('By time, descending')
    expect(
      describeSort({
        sortBy: SubmissionSortBy.TEAM,
        sortOrder: SubmissionSortOrder.ASC,
      })
    ).toBe('By team, ascending')
  })
})

describe('buildSubmissionsWorkbook', () => {
  test('writes a summary, then one sheet per challenge', async () => {
    const rows = [
      submission({
        createdAt: '2026-05-05T12:00:00.000Z',
        result: SubmissionResult.CORRECT,
        playerId: 'p1',
        playerName: 'Alice',
        playerUsername: 'alice',
        details: {
          submittedFlag: 'flag{yes}',
          aiLinks: [
            'https://chatgpt.com/share/1',
            'https://chatgpt.com/share/2',
          ],
          proof: { name: 'solve.py', sha256: 'abc123' },
        },
      }),
      submission({
        challengeId: 'chall-b',
        challengeName: 'Beta',
        challengeCategory: 'crypto',
        userId: 'team-b',
        userName: 'Team B',
        userBanned: true,
        result: SubmissionResult.CHEATED,
        cheatedFromId: 'team-a',
        cheatedFromName: 'Team A',
      }),
      submission({ createdAt: '2026-05-05T11:00:00.000Z', playerId: 'gone' }),
    ]

    const workbook = await readWorkbook(
      await buildSubmissionsWorkbook(rows, {
        ...info,
        filters: ['Result is Correct'],
      })
    )

    // challenges are ordered by category, then name
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
      'Summary',
      'crypto - Beta',
      'web - Alpha',
    ])

    const summary = workbook.getWorksheet('Summary')!
    expect(rowValues(summary, 2)).toEqual(['CTF', 'Test CTF'])
    expect(rowValues(summary, 4)).toEqual(['Sort', 'By time, descending'])
    expect(rowValues(summary, 5)).toEqual(['Filters', 'Result is Correct'])
    expect(rowValues(summary, 7)).toEqual([
      'Category',
      'Challenge',
      'Submissions',
      'Correct',
      'Cheated',
      'Incorrect',
      'Teams',
    ])
    const betaRow = rowValues(summary, 8)
    expect(betaRow[0]).toBe('crypto')
    expect(betaRow[1]).toMatchObject({
      text: 'Beta',
      hyperlink: "#'crypto - Beta'!A1",
    })
    expect(betaRow.slice(2)).toEqual([1, 0, 1, 0, 1])
    expect(rowValues(summary, 9).slice(2)).toEqual([2, 1, 0, 1, 1])
    expect(rowValues(summary, 10)).toEqual([
      'Total',
      '2 challenges',
      3,
      1,
      1,
      1,
      2,
    ])

    const alpha = workbook.getWorksheet('web - Alpha')!
    expect(rowValues(alpha, 1)).toEqual([
      'Time (UTC)',
      'Team',
      'Division',
      'Team banned',
      'Player',
      'Discord username',
      'IP',
      'Kind',
      'Result',
      'Submitted flag',
      'AI links',
      'Proof file',
      'Proof sha256',
      'Cheated from',
    ])
    expect(alpha.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(alpha.rowCount).toBe(3)

    // rows keep the order they were given in
    const first = rowValues(alpha, 2)
    expect((first[0] as Date).toISOString()).toBe('2026-05-05T12:00:00.000Z')
    expect(first.slice(1)).toEqual([
      'Team A',
      'open',
      'No',
      'Alice',
      'alice',
      '10.0.0.1',
      'Flag',
      'Correct',
      'flag{yes}',
      'https://chatgpt.com/share/1\nhttps://chatgpt.com/share/2',
      'solve.py',
      'abc123',
      '',
    ])
    expect(rowValues(alpha, 3)[4]).toBe('Deleted player')

    const beta = rowValues(workbook.getWorksheet('crypto - Beta')!, 2)
    expect(beta[3]).toBe('Yes')
    expect(beta[8]).toBe('Cheated')
    expect(beta[13]).toBe('Team A')
  })

  test('says None when no filters and handles no rows', async () => {
    const workbook = await readWorkbook(
      await buildSubmissionsWorkbook([], info)
    )
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Summary'])
    const summary = workbook.getWorksheet('Summary')!
    expect(rowValues(summary, 5)).toEqual(['Filters', 'None'])
    expect(rowValues(summary, 8)).toEqual([
      'Total',
      '0 challenges',
      0,
      0,
      0,
      0,
      0,
    ])
  })
})
