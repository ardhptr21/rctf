import { MAX_IMPORT_TEAMS, parseTeamsCsv, toCsv } from '@rctf/types'
import { describe, expect, test } from 'bun:test'

describe('parseTeamsCsv', () => {
  test('reads a name and an optional division per row', () => {
    expect(parseTeamsCsv('name,division\nAlpha,hs\nBeta,\n')).toEqual({
      rows: [
        { line: 2, name: 'Alpha', division: 'hs' },
        { line: 3, name: 'Beta', division: null },
      ],
      problems: [],
    })
  })

  test('handles quotes, commas and line breaks inside quotes', () => {
    const csv =
      'name,division\n"Comma, Inc",hs\n"Say ""hi""",hs\n"Two\nLines",hs\nAfter,hs'
    expect(parseTeamsCsv(csv).rows).toEqual([
      { line: 2, name: 'Comma, Inc', division: 'hs' },
      { line: 3, name: 'Say "hi"', division: 'hs' },
      { line: 4, name: 'Two\nLines', division: 'hs' },
      // the quoted line break moves the next row down a line
      { line: 6, name: 'After', division: 'hs' },
    ])
  })

  test('copes with a BOM, CRLF, blank lines, header case and extra columns', () => {
    const csv =
      '﻿Team ID, Name ,Division,Notes\r\n\r\n1,  Alpha  ,college,x\r\n,,,\r\n2,Beta,,y\r\n'
    expect(parseTeamsCsv(csv)).toEqual({
      rows: [
        { line: 3, name: 'Alpha', division: 'college' },
        { line: 5, name: 'Beta', division: null },
      ],
      problems: [],
    })
  })

  test('a file without a division column uses the default for all', () => {
    expect(parseTeamsCsv('name\nAlpha').rows).toEqual([
      { line: 2, name: 'Alpha', division: null },
    ])
  })

  test('reports files it cannot read', () => {
    expect(parseTeamsCsv('').problems).toEqual([
      { line: null, message: 'The file is empty.' },
    ])
    expect(parseTeamsCsv('team,division\nAlpha,hs').problems).toEqual([
      {
        line: 1,
        message: 'The first row must be a header with a "name" column.',
      },
    ])
    expect(parseTeamsCsv('name,division\n').problems).toEqual([
      { line: null, message: 'No teams to import.' },
    ])
    expect(parseTeamsCsv('name\nAlpha\n"Beta').problems).toEqual([
      { line: 3, message: 'A quoted field is never closed.' },
    ])
  })

  test('limits how many teams one file holds', () => {
    const rows = Array.from({ length: MAX_IMPORT_TEAMS + 1 }, (_, i) => `T${i}`)
    const parsed = parseTeamsCsv(['name', ...rows].join('\n'))
    expect(parsed.rows).toEqual([])
    expect(parsed.problems[0]!.message).toContain(`at most ${MAX_IMPORT_TEAMS}`)
  })

  test('reads back what toCsv writes', () => {
    const names = ['Plain', 'Comma, Inc', 'Say "hi"']
    const csv = toCsv(
      ['name', 'division'],
      names.map(name => [name, 'hs'])
    )
    expect(parseTeamsCsv(csv).rows.map(row => row.name)).toEqual(names)
  })
})
