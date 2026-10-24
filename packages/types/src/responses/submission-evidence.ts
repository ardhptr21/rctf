import { z } from 'zod/mini'
import { response } from '../internal'
import { example } from '../util/example'

export const BadAiLinks = response('badAiLinks', {
  status: 400,
  message:
    'Add links to the AI conversations you used, or enter "no ai" if you did not use AI.',
})

export const BadProofRequired = response('badProofRequired', {
  status: 400,
  message:
    'Upload a solver proof: your solve script or a screenshot of the flag.',
})

export const BadProofFileSize = response('badProofFileSize', {
  status: 413,
  message: 'The solver proof file is too large.',
  data: z.object({
    maxSize: example(z.int(), 5242880).check(
      z.describe('Maximum proof file size in bytes.')
    ),
  }),
})

export const BadUnknownSubmission = response('badUnknownSubmission', {
  status: 404,
  message: 'The submission was not found.',
})

export const BadNoProof = response('badNoProof', {
  status: 404,
  message: 'This submission has no solver proof.',
})

export const GoodSubmissionProof = response('goodSubmissionProof', {
  status: 200,
  message: 'The solver proof was retrieved.',
  data: z.object({
    name: example(z.string(), 'solve.py').check(
      z.describe('Original file name.')
    ),
    size: example(z.int(), 1024).check(z.describe('File size in bytes.')),
    contentType: example(z.string(), 'text/x-python').check(
      z.describe('Content type reported by the uploader.')
    ),
    data: example(z.string(), 'cHJpbnQoMSk=').check(
      z.describe('File contents, base64-encoded.')
    ),
  }),
})
