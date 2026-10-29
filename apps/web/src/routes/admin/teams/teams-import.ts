import { toCsv } from '@rctf/types'

export type TeamJoinCode = {
  name: string
  division: string
  banned?: boolean
  // teams registered by email have none
  joinToken: string | null
}

// A starting file for admins: the header and one example row.
export function importTemplateCsv(division: string): string {
  return toCsv(['name', 'division'], [['Example Team', division]])
}

// Each team's join code, to hand out to the teams.
export function joinCodesCsv(
  teams: readonly TeamJoinCode[],
  divisions: Record<string, string>
): string {
  return toCsv(
    ['name', 'division', 'banned', 'join code'],
    teams.map(team => [
      team.name,
      divisions[team.division] ?? team.division,
      team.banned ? 'yes' : 'no',
      team.joinToken ?? '',
    ])
  )
}

export function joinCodesFileName(ctfName: string): string {
  const slug =
    ctfName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'ctf'
  return `${slug}-team-join-codes.csv`
}
