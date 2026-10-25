import { IntegritySeverity, type IntegritySignalKind } from '@rctf/types'

const SEVERITY_WEIGHT: Record<IntegritySeverity, number> = {
  [IntegritySeverity.LOW]: 1,
  [IntegritySeverity.MEDIUM]: 4,
  [IntegritySeverity.HIGH]: 10,
}

const SEVERITY_RANK: Record<IntegritySeverity, number> = {
  [IntegritySeverity.LOW]: 0,
  [IntegritySeverity.MEDIUM]: 1,
  [IntegritySeverity.HIGH]: 2,
}

export const severityAtLeast = (
  severity: IntegritySeverity,
  minimum: IntegritySeverity
): boolean => SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum]

// A case's risk score: the sum of its signals' weights, raised by half for
// each extra kind of signal, since independent kinds agreeing is far
// stronger evidence than one kind repeating.
export const caseScore = (
  signals: ReadonlyArray<{
    kind: IntegritySignalKind
    severity: IntegritySeverity
  }>
): number => {
  if (signals.length === 0) return 0
  const weight = signals.reduce(
    (total, signal) => total + SEVERITY_WEIGHT[signal.severity],
    0
  )
  const kinds = new Set(signals.map(signal => signal.kind)).size
  return Math.round(weight * (1 + 0.5 * (kinds - 1)))
}

// Cases are keyed by the team pair with the smaller id first, so A-B and
// B-A land in the same case; single-team cases have no second team.
export const orderPair = (
  teamId: string,
  otherTeamId: string | null
): [string, string | null] =>
  otherTeamId === null || teamId < otherTeamId
    ? [teamId, otherTeamId]
    : [otherTeamId, teamId]

export const pairKey = (teamId: string, otherTeamId: string | null): string => {
  const [first, second] = orderPair(teamId, otherTeamId)
  return `${first}:${second ?? ''}`
}
