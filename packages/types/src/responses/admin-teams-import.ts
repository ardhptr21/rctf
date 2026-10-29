import { z } from 'zod/mini'
import { response } from '../internal'
import { example } from '../util/example'

const ImportProblemSchema = z.object({
  line: example(z.nullable(z.int()), 7).check(
    z.describe('Line of the file, or `null` for the file as a whole.')
  ),
  message: example(
    z.string(),
    'Name "Heap Hoppers" is already used on line 3.'
  ).check(z.describe('What is wrong.')),
})

const ImportTeamSchema = z.object({
  line: example(z.int(), 2).check(z.describe('Line of the file.')),
  name: example(z.string(), 'Heap Hoppers').check(z.describe('Team name.')),
  division: example(z.string(), 'open').check(
    z.describe('Team division, with blanks resolved to the default division.')
  ),
})

export const GoodAdminTeamsImportPreview = response(
  'goodAdminTeamsImportPreview',
  {
    status: 200,
    message: 'The import file was checked. Nothing was created.',
    data: z.object({
      teams: z
        .array(ImportTeamSchema)
        .check(z.describe('The teams the file would create.')),
      problems: z
        .array(ImportProblemSchema)
        .check(z.describe('Problems that must be fixed before importing.')),
    }),
  }
)

export const GoodAdminTeamsImport = response('goodAdminTeamsImport', {
  status: 200,
  message: 'The teams were created.',
  data: z.object({
    teams: z
      .array(
        z.object({
          id: example(z.string(), 'team-1a2b3c').check(z.describe('Team ID.')),
          name: example(z.string(), 'Heap Hoppers').check(
            z.describe('Team name.')
          ),
          division: example(z.string(), 'open').check(
            z.describe('Team division.')
          ),
          joinToken: example(z.string(), '<join-token>').check(
            z.describe('Code players use to join the team.')
          ),
        })
      )
      .check(z.describe('The created teams, in file order.')),
  }),
})

export const BadTeamsImport = response('badTeamsImport', {
  status: 400,
  message: 'The import file has problems; no teams were created.',
  data: z.object({
    problems: z
      .array(ImportProblemSchema)
      .check(z.describe('Problems that must be fixed before importing.')),
  }),
})

export const GoodAdminTeamJoinCodes = response('goodAdminTeamJoinCodes', {
  status: 200,
  message: 'The join codes were retrieved.',
  data: z.object({
    teams: z
      .array(
        z.object({
          id: example(z.string(), 'team-1a2b3c').check(z.describe('Team ID.')),
          name: example(z.string(), 'Heap Hoppers').check(
            z.describe('Team name.')
          ),
          division: example(z.string(), 'open').check(
            z.describe('Team division.')
          ),
          banned: example(z.boolean(), false).check(
            z.describe('Whether the team is banned.')
          ),
          joinToken: example(z.nullable(z.string()), '<join-token>').check(
            z.describe(
              'Code players use to join the team, or `null` for teams registered by email.'
            )
          ),
        })
      )
      .check(z.describe('Every matching team, in the requested order.')),
  }),
})
