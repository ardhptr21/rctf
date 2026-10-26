import {
  SubmissionKind,
  SubmissionResult,
  SubmissionSortBy,
  SubmissionSortOrder,
  SubmissionTeamStatus,
} from '@rctf/types'
import ExcelJS from 'exceljs'
import type {
  AdminSubmissionInfo,
  AdminSubmissionsFilters,
} from './submissions'

export const SUMMARY_SHEET = 'Summary'
const MAX_SHEET_NAME = 31

const KIND_LABEL: Record<SubmissionKind, string> = {
  [SubmissionKind.FLAG]: 'Flag',
  [SubmissionKind.ADMIN_BOT]: 'Admin bot',
}

const RESULT_LABEL: Record<SubmissionResult, string> = {
  [SubmissionResult.CORRECT]: 'Correct',
  [SubmissionResult.CHEATED]: 'Cheated',
  [SubmissionResult.INCORRECT]: 'Incorrect',
  [SubmissionResult.ALREADY_SOLVED]: 'Already solved',
  [SubmissionResult.QUEUED]: 'Queued',
  [SubmissionResult.ACTIVE_JOB]: 'Active job',
  [SubmissionResult.INVALID_INPUT]: 'Invalid input',
  [SubmissionResult.BAD_INSTANCER_STATE]: 'Bad instancer state',
}

// A sheet name Excel accepts: no []:*?/\, at most 31 characters, unique
// (case-insensitively) and never the summary's name. `used` is updated.
export const sheetName = (
  category: string,
  name: string,
  used: Set<string>
): string => {
  const clean = (part: string) =>
    part
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      // a leading or trailing apostrophe is not allowed either
      .replace(/^'+|'+$/g, '')
      .trim()
  const base =
    [clean(category), clean(name)].filter(Boolean).join(' - ') || 'Challenge'

  for (let attempt = 1; ; attempt++) {
    const suffix = attempt === 1 ? '' : ` (${attempt})`
    const candidate =
      base.slice(0, MAX_SHEET_NAME - suffix.length).replace(/[\s']+$/, '') +
      suffix
    const key = candidate.toLowerCase()
    if (key !== SUMMARY_SHEET.toLowerCase() && !used.has(key)) {
      used.add(key)
      return candidate
    }
  }
}

export const exportFileName = (ctfName: string, generatedAt: Date): string => {
  const slug =
    ctfName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'ctf'
  return `${slug}-submissions-${generatedAt.toISOString().slice(0, 10)}.xlsx`
}

const SORT_LABEL: Record<SubmissionSortBy, string> = {
  [SubmissionSortBy.CREATED_AT]: 'time',
  [SubmissionSortBy.CHALLENGE]: 'challenge',
  [SubmissionSortBy.TEAM]: 'team',
  [SubmissionSortBy.IP]: 'IP',
  [SubmissionSortBy.KIND]: 'kind',
  [SubmissionSortBy.RESULT]: 'result',
}

type IncludeExclude<T> =
  | { include?: T[] | null | undefined; exclude?: T[] | null | undefined }
  | null
  | undefined

const describeSet = <T>(
  label: string,
  filter: IncludeExclude<T>,
  name: (value: T) => string
): string[] => [
  ...(filter?.include?.length
    ? [`${label} is ${filter.include.map(name).join(', ')}`]
    : []),
  ...(filter?.exclude?.length
    ? [`${label} is not ${filter.exclude.map(name).join(', ')}`]
    : []),
]

// The applied filters and sort as lines for the summary sheet. Challenge
// and team ids are shown by name when `names` has them.
export const describeFilters = (
  params: AdminSubmissionsFilters,
  names: {
    challenges: ReadonlyMap<string, string>
    teams: ReadonlyMap<string, string>
  }
): string[] => {
  const lines = [
    ...describeSet(
      'Challenge',
      params.challenge,
      id => names.challenges.get(id) ?? id
    ),
    ...describeSet('Team', params.team, id => names.teams.get(id) ?? id),
    ...describeSet('Kind', params.kind, kind => KIND_LABEL[kind] ?? kind),
    ...describeSet(
      'Result',
      params.result,
      result => RESULT_LABEL[result] ?? result
    ),
    ...describeSet('Team status', params.teamStatus, status =>
      status === SubmissionTeamStatus.BANNED ? 'Banned' : 'Not banned'
    ),
    ...describeSet('Category', params.category, category => category),
    ...describeSet('Division', params.division, division => division),
  ]
  if (params.createdAfter) lines.push(`From ${params.createdAfter} (UTC)`)
  if (params.createdBefore) lines.push(`Until ${params.createdBefore} (UTC)`)
  if (params.challengeSearch) {
    lines.push(`Challenge search "${params.challengeSearch}"`)
  }
  if (params.teamSearch) {
    lines.push(`Team or player search "${params.teamSearch}"`)
  }
  return lines
}

export const describeSort = (params: AdminSubmissionsFilters): string => {
  const by = params.sortBy ?? SubmissionSortBy.CREATED_AT
  const ascending = params.sortOrder === SubmissionSortOrder.ASC
  return `By ${SORT_LABEL[by]}, ${ascending ? 'ascending' : 'descending'}`
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(item => typeof item === 'string') : []

type ChallengeGroup = {
  id: string
  name: string
  category: string
  rows: AdminSubmissionInfo[]
}

// keeps each challenge's rows in the order they came, which is the sort the
// admin chose
const groupByChallenge = (
  rows: readonly AdminSubmissionInfo[]
): ChallengeGroup[] => {
  const groups = new Map<string, ChallengeGroup>()
  for (const row of rows) {
    let group = groups.get(row.challengeId)
    if (!group) {
      group = {
        id: row.challengeId,
        name: row.challengeName,
        category: row.challengeCategory,
        rows: [],
      }
      groups.set(row.challengeId, group)
    }
    group.rows.push(row)
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  )
}

const SUBMISSION_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Time (UTC)', key: 'time', width: 20 },
  { header: 'Team', key: 'team', width: 24 },
  { header: 'Division', key: 'division', width: 12 },
  { header: 'Team banned', key: 'banned', width: 12 },
  { header: 'Player', key: 'player', width: 20 },
  { header: 'Discord username', key: 'username', width: 20 },
  { header: 'IP', key: 'ip', width: 18 },
  { header: 'Kind', key: 'kind', width: 10 },
  { header: 'Result', key: 'result', width: 14 },
  { header: 'Submitted flag', key: 'flag', width: 32 },
  { header: 'AI links', key: 'aiLinks', width: 40 },
  { header: 'Proof file', key: 'proofName', width: 20 },
  { header: 'Proof sha256', key: 'proofSha', width: 24 },
  { header: 'Cheated from', key: 'cheatedFrom', width: 20 },
]

const submissionRow = (row: AdminSubmissionInfo) => {
  const proof =
    row.details.proof && typeof row.details.proof === 'object'
      ? (row.details.proof as Record<string, unknown>)
      : {}
  return {
    time: new Date(row.createdAt),
    team: row.userName,
    division: row.userDivision,
    banned: row.userBanned ? 'Yes' : 'No',
    // a player id without a name means the account was deleted
    player: row.playerId ? (row.playerName ?? 'Deleted player') : '',
    username: row.playerUsername ?? '',
    ip: row.ip,
    kind: KIND_LABEL[row.kind] ?? row.kind,
    result: RESULT_LABEL[row.result] ?? row.result,
    flag: text(row.details.submittedFlag),
    aiLinks: textList(row.details.aiLinks).join('\n'),
    proofName: text(proof.name),
    proofSha: text(proof.sha256),
    cheatedFrom: row.cheatedFromName ?? row.cheatedFromId ?? '',
  }
}

const styleHeader = (sheet: ExcelJS.Worksheet, row: number) => {
  const header = sheet.getRow(row)
  header.font = { bold: true }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7E9EE' },
  }
}

const addChallengeSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  group: ChallengeGroup
) => {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = SUBMISSION_COLUMNS
  styleHeader(sheet, 1)
  sheet.addRows(group.rows.map(submissionRow))
  sheet.getColumn('time').numFmt = 'yyyy-mm-dd hh:mm:ss'
  sheet.getColumn('aiLinks').alignment = { wrapText: true, vertical: 'top' }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: SUBMISSION_COLUMNS.length },
  }
}

const countResult = (rows: readonly AdminSubmissionInfo[], result: string) =>
  rows.filter(row => row.result === result).length

const addSummarySheet = (
  workbook: ExcelJS.Workbook,
  groups: readonly ChallengeGroup[],
  sheetNames: ReadonlyMap<string, string>,
  info: ExportInfo
) => {
  const sheet = workbook.addWorksheet(SUMMARY_SHEET)
  sheet.columns = [
    { width: 16 },
    { width: 36 },
    { width: 14 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
  ]

  sheet.addRow(['Submissions export']).font = { bold: true, size: 14 }
  sheet.addRow(['CTF', info.ctfName])
  sheet.addRow(['Exported (UTC)', info.generatedAt])
  sheet.getCell('B3').numFmt = 'yyyy-mm-dd hh:mm:ss'
  sheet.getCell('B3').alignment = { horizontal: 'left' }
  sheet.addRow(['Sort', info.sort])
  const filters = info.filters.length > 0 ? info.filters : ['None']
  filters.forEach((filter, index) =>
    sheet.addRow([index === 0 ? 'Filters' : '', filter])
  )
  for (let row = 2; row <= 4 + filters.length; row++) {
    sheet.getCell(row, 1).font = { bold: true }
  }
  sheet.addRow([])

  const header = sheet.addRow([
    'Category',
    'Challenge',
    'Submissions',
    'Correct',
    'Cheated',
    'Incorrect',
    'Teams',
  ])
  styleHeader(sheet, header.number)

  for (const group of groups) {
    const target = sheetNames.get(group.id)!
    const row = sheet.addRow([
      group.category,
      // links to the challenge's own sheet
      { text: group.name, hyperlink: `#'${target.replace(/'/g, "''")}'!A1` },
      group.rows.length,
      countResult(group.rows, SubmissionResult.CORRECT),
      countResult(group.rows, SubmissionResult.CHEATED),
      countResult(group.rows, SubmissionResult.INCORRECT),
      new Set(group.rows.map(entry => entry.userId)).size,
    ])
    row.getCell(2).font = { color: { argb: 'FF2563EB' }, underline: true }
  }

  const all = groups.flatMap(group => group.rows)
  sheet.addRow([
    'Total',
    `${groups.length} challenge${groups.length === 1 ? '' : 's'}`,
    all.length,
    countResult(all, SubmissionResult.CORRECT),
    countResult(all, SubmissionResult.CHEATED),
    countResult(all, SubmissionResult.INCORRECT),
    new Set(all.map(entry => entry.userId)).size,
  ]).font = { bold: true }
}

export type ExportInfo = {
  ctfName: string
  generatedAt: Date
  filters: readonly string[]
  sort: string
}

// A workbook with a summary sheet, then one sheet per challenge.
export const buildSubmissionsWorkbook = async (
  rows: readonly AdminSubmissionInfo[],
  info: ExportInfo
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'rCTF'
  workbook.created = info.generatedAt

  const groups = groupByChallenge(rows)
  const used = new Set<string>()
  const names = new Map(
    groups.map(group => [group.id, sheetName(group.category, group.name, used)])
  )

  addSummarySheet(workbook, groups, names, info)
  for (const group of groups) {
    addChallengeSheet(workbook, names.get(group.id)!, group)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
