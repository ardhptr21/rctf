import { normalizeName } from '../v1-validators'

export const MAX_IMPORT_TEAMS = 1000

export type TeamsCsvRow = {
  // 1-based line of the file the row starts on, for error messages
  line: number
  name: string
  // blank means the default division
  division: string | null
}

export type TeamsCsvProblem = { line: number | null; message: string }

export type ParsedTeamsCsv = {
  rows: TeamsCsvRow[]
  problems: TeamsCsvProblem[]
}

// Splits CSV text into records of fields, RFC 4180 style: quoted fields may
// hold commas, line breaks and doubled quotes. Each record carries the line
// it starts on.
const readRecords = (
  text: string
): { records: { line: number; fields: string[] }[]; unclosedAt?: number } => {
  const records: { line: number; fields: string[] }[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let recordLine = 1

  const endField = () => {
    fields.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    records.push({ line: recordLine, fields })
    fields = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        if (char === '\n') line++
        field += char
      }
    } else if (char === '"' && field === '') {
      quoted = true
    } else if (char === ',') {
      endField()
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else {
      field += char
    }
  }
  if (quoted) return { records, unclosedAt: recordLine }
  if (field !== '' || fields.length > 0) endRecord()
  return { records }
}

const headerKey = (value: string) => value.toLowerCase().replace(/\s+/g, '')

// Reads a team import file: a header row with a `name` column and an
// optional `division` column, then one team per row. Other columns are
// ignored. Only the file's shape is checked here; names and divisions are
// checked by the server.
export const parseTeamsCsv = (text: string): ParsedTeamsCsv => {
  const { records, unclosedAt } = readRecords(text.replace(/^﻿/, ''))
  if (unclosedAt !== undefined) {
    return {
      rows: [],
      problems: [
        { line: unclosedAt, message: 'A quoted field is never closed.' },
      ],
    }
  }

  const nonEmpty = records.filter(record =>
    record.fields.some(value => value.trim() !== '')
  )
  const [header, ...body] = nonEmpty
  if (!header) {
    return {
      rows: [],
      problems: [{ line: null, message: 'The file is empty.' }],
    }
  }
  const columns = header.fields.map(headerKey)
  const nameColumn = columns.indexOf('name')
  const divisionColumn = columns.indexOf('division')
  if (nameColumn === -1) {
    return {
      rows: [],
      problems: [
        {
          line: header.line,
          message: 'The first row must be a header with a "name" column.',
        },
      ],
    }
  }
  if (body.length === 0) {
    return {
      rows: [],
      problems: [{ line: null, message: 'No teams to import.' }],
    }
  }
  if (body.length > MAX_IMPORT_TEAMS) {
    return {
      rows: [],
      problems: [
        {
          line: null,
          message: `The file has ${body.length} teams; at most ${MAX_IMPORT_TEAMS} can be imported at once.`,
        },
      ],
    }
  }

  const rows = body.map(record => {
    const division =
      divisionColumn === -1 ? '' : (record.fields[divisionColumn] ?? '').trim()
    return {
      line: record.line,
      name: normalizeName(record.fields[nameColumn] ?? ''),
      division: division === '' ? null : division,
    }
  })
  return { rows, problems: [] }
}

const csvField = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

// CSV text for rows of values, with a header row.
export const toCsv = (
  header: readonly string[],
  rows: readonly (readonly string[])[]
): string =>
  [header, ...rows].map(row => row.map(csvField).join(',')).join('\r\n') +
  '\r\n'
