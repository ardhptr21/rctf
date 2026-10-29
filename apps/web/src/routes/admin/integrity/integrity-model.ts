import {
  IntegrityCaseStatus,
  IntegritySeverity,
  IntegritySignalKind,
  type GetAdminIntegrityCaseRouteV2,
  type GetAdminIntegrityCasesRouteV2,
  type RouteResponseData,
} from '@rctf/types'

export type IntegrityCase = RouteResponseData<
  typeof GetAdminIntegrityCasesRouteV2
>['cases'][number]
export type IntegrityCaseDetail = RouteResponseData<
  typeof GetAdminIntegrityCaseRouteV2
>
export type IntegritySignal = IntegrityCaseDetail['signals'][number]

export const PAGE_SIZE = 50
export const ROW_HEIGHT = 52

export const STATUS_TABS: readonly {
  value: IntegrityCaseStatus
  label: string
}[] = [
  { value: IntegrityCaseStatus.OPEN, label: 'Open' },
  { value: IntegrityCaseStatus.DISMISSED, label: 'Dismissed' },
  { value: IntegrityCaseStatus.ACTIONED, label: 'Actioned' },
]

export const KIND_LABEL: Record<IntegritySignalKind, string> = {
  [IntegritySignalKind.FLAG_SHARING]: 'Flag sharing',
  [IntegritySignalKind.SHARED_IP]: 'Shared IP',
  [IntegritySignalKind.DUPLICATE_PROOF]: 'Duplicate proof',
  [IntegritySignalKind.DUPLICATE_AI_LINK]: 'Duplicate AI link',
  [IntegritySignalKind.SOLVED_WITHOUT_DOWNLOAD]: 'Solved without download',
  [IntegritySignalKind.UNLISTED_AI_LINK]: 'Unlisted AI link',
  [IntegritySignalKind.MIXED_AI_SOURCE]: 'Mixed AI source',
}

export const SEVERITY_LABEL: Record<IntegritySeverity, string> = {
  [IntegritySeverity.LOW]: 'Low',
  [IntegritySeverity.MEDIUM]: 'Medium',
  [IntegritySeverity.HIGH]: 'High',
}

export type RiskBand = 'low' | 'medium' | 'high'

// One high signal (10) is already worth a look; a mix of kinds quickly
// passes 25.
export function riskBand(score: number): RiskBand {
  if (score >= 25) return 'high'
  if (score >= 10) return 'medium'
  return 'low'
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : ''

// What matched, in a sentence an admin can act on.
export function describeEvidence(signal: IntegritySignal): string {
  const { evidence } = signal
  switch (signal.kind) {
    case IntegritySignalKind.FLAG_SHARING:
      return `Submitted the other team's flag ${text(evidence.flag)}`
    case IntegritySignalKind.SHARED_IP:
      return `Both teams submitted from ${text(evidence.ip)}`
    case IntegritySignalKind.DUPLICATE_PROOF:
      return `Same solver proof file (${text(evidence.name) || 'unnamed'}, sha256 ${text(evidence.sha256).slice(0, 12)}…)`
    case IntegritySignalKind.DUPLICATE_AI_LINK:
      return `Same AI link ${text(evidence.link)}`
    case IntegritySignalKind.SOLVED_WITHOUT_DOWNLOAD: {
      const files = Number(evidence.files) || 0
      return files === 1
        ? 'Solved without downloading the attachment'
        : `Solved without downloading any of the ${files} attachments`
    }
    case IntegritySignalKind.UNLISTED_AI_LINK:
      return `AI link outside the allowed patterns: ${text(evidence.link)}`
    case IntegritySignalKind.MIXED_AI_SOURCE: {
      const count = Number(evidence.sourceCount) || 0
      return `Used ${text(evidence.source)} in ${count} submission${count === 1 ? '' : 's'}; the team's usual source is ${text(evidence.usualSource)} (${Number(evidence.usualCount) || 0})`
    }
  }
}

export function caseTeamsLabel(kase: IntegrityCase): string {
  return kase.otherTeam
    ? `${kase.team.name} and ${kase.otherTeam.name}`
    : kase.team.name
}
