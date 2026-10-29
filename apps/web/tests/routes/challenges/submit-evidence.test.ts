import {
  collectAiLinks,
  formatFileSize,
  validateEvidence,
} from '$routes/challenges/details/submit-evidence'
import { describe, expect, it } from 'bun:test'

const file = (size: number) => new File([new Uint8Array(size)], 'solve.py')
const MAX = 5 * 1024 * 1024
const both = { requireAiLinks: true, requireSolverProof: true }

describe('collectAiLinks', () => {
  it('sends exactly "no ai" when the player did not use AI', () => {
    expect(collectAiLinks(['https://a.example'], true)).toEqual(['no ai'])
  })

  it('trims links and drops empty fields', () => {
    expect(collectAiLinks([' https://a.example ', '', '  '], false)).toEqual([
      'https://a.example',
    ])
  })
})

describe('validateEvidence', () => {
  it('passes with a link and a proof file', () => {
    expect(
      validateEvidence({
        ...both,
        links: ['https://chatgpt.com/share/1'],
        noAi: false,
        proof: file(10),
        maxProofSize: MAX,
      })
    ).toEqual({})
  })

  it('passes with "no ai" and a proof file', () => {
    expect(
      validateEvidence({
        ...both,
        links: [''],
        noAi: true,
        proof: file(10),
        maxProofSize: MAX,
      })
    ).toEqual({})
  })

  it('requires a valid link', () => {
    const errors = validateEvidence({
      ...both,
      links: ['not a link'],
      noAi: false,
      proof: file(10),
      maxProofSize: MAX,
    })
    expect(errors.aiLinks).toBeDefined()
    expect(errors.proof).toBeUndefined()
  })

  it('requires a proof file within the size limit', () => {
    expect(
      validateEvidence({
        ...both,
        links: [''],
        noAi: true,
        proof: null,
        maxProofSize: MAX,
      }).proof
    ).toBeDefined()
    expect(
      validateEvidence({
        ...both,
        links: [''],
        noAi: true,
        proof: file(MAX + 1),
        maxProofSize: MAX,
      }).proof
    ).toContain('5.0 MB')
  })
})

describe('validateEvidence with one requirement', () => {
  it('checks only the AI links when only they are required', () => {
    expect(
      validateEvidence({
        requireAiLinks: true,
        requireSolverProof: false,
        links: ['https://chatgpt.com/share/1'],
        noAi: false,
        proof: null,
        maxProofSize: MAX,
      })
    ).toEqual({})
    expect(
      validateEvidence({
        requireAiLinks: true,
        requireSolverProof: false,
        links: [''],
        noAi: false,
        proof: null,
        maxProofSize: MAX,
      }).aiLinks
    ).toBeDefined()
  })

  it('checks only the proof when only it is required', () => {
    const proofOnly = { requireAiLinks: false, requireSolverProof: true }
    expect(
      validateEvidence({
        ...proofOnly,
        links: [''],
        noAi: false,
        proof: file(10),
        maxProofSize: MAX,
      })
    ).toEqual({})
    expect(
      validateEvidence({
        ...proofOnly,
        links: [''],
        noAi: false,
        proof: null,
        maxProofSize: MAX,
      })
    ).toEqual({
      proof: 'Upload your solve script or a screenshot of the flag.',
    })
  })

  it('checks nothing when neither is required', () => {
    expect(
      validateEvidence({
        requireAiLinks: false,
        requireSolverProof: false,
        links: ['not a link'],
        noAi: false,
        proof: null,
        maxProofSize: MAX,
      })
    ).toEqual({})
  })
})

describe('formatFileSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
