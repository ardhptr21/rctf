import { z } from 'zod/mini'
import { response } from '../internal'
import { example } from '../util/example'

export const GoodAdminSubmissionsExport = response(
  'goodAdminSubmissionsExport',
  {
    status: 200,
    message: 'The submissions were exported.',
    data: z.object({
      fileName: example(z.string(), 'rctf-submissions-2024-03-09.xlsx').check(
        z.describe('Suggested file name.')
      ),
      data: example(z.string(), 'UEsDBBQAAAAIA…').check(
        z.describe(
          'The `.xlsx` file, base64-encoded: a Summary sheet, then one sheet per challenge.'
        )
      ),
    }),
  }
)

export const BadExportTooLarge = response('badExportTooLarge', {
  status: 400,
  message: 'Too many submissions to export; narrow the filters.',
  data: z.object({
    total: example(z.int(), 72000).check(
      z.describe('Submissions matching the filters.')
    ),
    max: example(z.int(), 50000).check(
      z.describe('Most submissions one export can hold.')
    ),
  }),
})
