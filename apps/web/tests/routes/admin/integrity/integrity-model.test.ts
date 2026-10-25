import {
  IntegrityCaseStatus,
  IntegritySeverity,
  IntegritySignalKind,
} from '@rctf/types'
import {
  caseTeamsLabel,
  describeEvidence,
  riskBand,
  type IntegrityCase,
  type IntegritySignal,
} from '$routes/admin/integrity/integrity-model'
import { describe, expect, test } from 'bun:test'

const signal = (
  kind: IntegritySignalKind,
  evidence: Record<string, unknown>
): IntegritySignal => ({
  id: 's1',
  kind,
  severity: IntegritySeverity.HIGH,
  teamId: 't1',
  otherTeamId: 't2',
  challenge: null,
  evidence,
  createdAt: 0,
})

describe('riskBand', () => {
  test('bands scores into low, medium and high', () => {
    expect(riskBand(4)).toBe('low')
    expect(riskBand(10)).toBe('medium')
    expect(riskBand(24)).toBe('medium')
    expect(riskBand(25)).toBe('high')
  })
})

describe('describeEvidence', () => {
  test('explains what matched for each kind', () => {
    expect(
      describeEvidence(
        signal(IntegritySignalKind.FLAG_SHARING, { flag: 'flag{x}' })
      )
    ).toBe("Submitted the other team's flag flag{x}")
    expect(
      describeEvidence(signal(IntegritySignalKind.SHARED_IP, { ip: '1.2.3.4' }))
    ).toBe('Both teams submitted from 1.2.3.4')
    expect(
      describeEvidence(
        signal(IntegritySignalKind.DUPLICATE_PROOF, {
          sha256: 'abcdef0123456789',
          name: 'solve.py',
        })
      )
    ).toBe('Same solver proof file (solve.py, sha256 abcdef012345…)')
    expect(
      describeEvidence(
        signal(IntegritySignalKind.DUPLICATE_AI_LINK, { link: 'https://x' })
      )
    ).toBe('Same AI link https://x')
  })

  test('explains the single-team signals', () => {
    expect(
      describeEvidence(
        signal(IntegritySignalKind.SOLVED_WITHOUT_DOWNLOAD, { files: 1 })
      )
    ).toBe('Solved without downloading the attachment')
    expect(
      describeEvidence(
        signal(IntegritySignalKind.SOLVED_WITHOUT_DOWNLOAD, { files: 3 })
      )
    ).toBe('Solved without downloading any of the 3 attachments')
    expect(
      describeEvidence(
        signal(IntegritySignalKind.UNLISTED_AI_LINK, {
          link: 'https://example.com/chat',
        })
      )
    ).toBe('AI link outside the allowed patterns: https://example.com/chat')
  })

  test('copes with missing evidence fields', () => {
    expect(
      describeEvidence(signal(IntegritySignalKind.DUPLICATE_PROOF, {}))
    ).toBe('Same solver proof file (unnamed, sha256 …)')
  })
})

describe('caseTeamsLabel', () => {
  const base: IntegrityCase = {
    id: 'c1',
    status: IntegrityCaseStatus.OPEN,
    score: 10,
    signalCount: 1,
    kinds: [IntegritySignalKind.SHARED_IP],
    team: { id: 't1', name: 'otters', banned: false },
    otherTeam: null,
    lastSignalAt: 0,
    createdAt: 0,
    note: null,
    resolvedAt: null,
  }

  test('names one or both teams', () => {
    expect(caseTeamsLabel(base)).toBe('otters')
    expect(
      caseTeamsLabel({
        ...base,
        otherTeam: { id: 't2', name: 'badgers', banned: false },
      })
    ).toBe('otters and badgers')
  })
})
