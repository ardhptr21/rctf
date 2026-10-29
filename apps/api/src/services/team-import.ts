import { users, type DatabaseClient } from '@rctf/db'
import { getErrorConstraint } from '@rctf/db/util'
import {
  parseTeamsCsv,
  UserName,
  type TeamsCsvProblem,
  type TeamsCsvRow,
} from '@rctf/types'
import { inArray } from 'drizzle-orm'
import { defaultDivision, divisionAllowed } from '../util/acl'
import { generateJoinToken } from './teams'

export type ImportTeam = { line: number; name: string; division: string }

export type TeamImportCheck = {
  teams: ImportTeam[]
  problems: TeamsCsvProblem[]
}

export type CreatedTeam = {
  id: string
  name: string
  division: string
  joinToken: string
}

const nameProblem = (name: string): string | null => {
  if (name === '') return 'The team name is empty.'
  return UserName.safeParse(name).success
    ? null
    : `Name "${name}" must be 2-64 printable characters.`
}

// Checks every row of a team import file: names follow the team name rules
// and are unique, both within the file and against existing teams, and
// divisions exist. Blank divisions become the default division.
export const checkTeamImport = async (
  db: DatabaseClient,
  csv: string
): Promise<TeamImportCheck> => {
  const parsed = parseTeamsCsv(csv)
  if (parsed.problems.length > 0) {
    return { teams: [], problems: parsed.problems }
  }

  const problems: TeamsCsvProblem[] = []
  const firstLine = new Map<string, number>()
  const teams = parsed.rows.map((row: TeamsCsvRow) => {
    const division = row.division ?? defaultDivision
    const issue = nameProblem(row.name)
    if (issue) {
      problems.push({ line: row.line, message: issue })
    } else {
      // names are unique regardless of case
      const key = row.name.toLowerCase()
      const earlier = firstLine.get(key)
      if (earlier !== undefined) {
        problems.push({
          line: row.line,
          message: `Name "${row.name}" is already used on line ${earlier}.`,
        })
      } else {
        firstLine.set(key, row.line)
      }
    }
    if (!division || !divisionAllowed(null, division)) {
      problems.push({
        line: row.line,
        message: `Division "${row.division ?? ''}" does not exist.`,
      })
    }
    return { line: row.line, name: row.name, division: division ?? '' }
  })

  const names = [...firstLine.keys()]
  if (names.length > 0) {
    // users.name is case-insensitive, so this matches any casing
    const taken = await db
      .select({ name: users.name })
      .from(users)
      .where(inArray(users.name, names))
    const takenKeys = new Set(taken.map(row => row.name.toLowerCase()))
    for (const team of teams) {
      const key = team.name.toLowerCase()
      if (takenKeys.has(key) && firstLine.get(key) === team.line) {
        problems.push({
          line: team.line,
          message: `A team named "${team.name}" already exists.`,
        })
      }
    }
  }

  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
  return { teams, problems }
}

export type TeamImportResult =
  | { ok: true; teams: CreatedTeam[] }
  | { ok: false; problems: TeamsCsvProblem[] }

// Creates every team in the file, or none of them when any row has a
// problem. The file is checked again here, since a name may have been taken
// since the preview.
export const importTeams = async (
  db: DatabaseClient,
  csv: string
): Promise<TeamImportResult> => {
  const checked = await checkTeamImport(db, csv)
  if (checked.problems.length > 0) {
    return { ok: false, problems: checked.problems }
  }

  try {
    const created = await db.transaction(tx =>
      tx
        .insert(users)
        .values(
          checked.teams.map(team => ({
            id: crypto.randomUUID(),
            name: team.name,
            division: team.division,
            perms: 0,
            joinToken: generateJoinToken(),
          }))
        )
        .returning({
          id: users.id,
          name: users.name,
          division: users.division,
          joinToken: users.joinToken,
        })
    )
    // returning keeps the insert order, which is the file order
    return {
      ok: true,
      teams: created.map(team => ({ ...team, joinToken: team.joinToken! })),
    }
  } catch (error) {
    if (getErrorConstraint(error) === 'users_name_key') {
      return {
        ok: false,
        problems: [
          {
            line: null,
            message:
              'A team with one of these names was just created. Check the file again.',
          },
        ],
      }
    }
    throw error
  }
}
