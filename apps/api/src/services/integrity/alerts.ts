import { config } from '@rctf/config'
import { challenges, users, type DatabaseClient } from '@rctf/db'
import {
  IntegrityCaseStatus,
  IntegritySignalKind,
  type IntegritySeverity,
} from '@rctf/types'
import { inArray } from 'drizzle-orm'
import type { MessageProvider } from '../../providers/messages/base'
import type { RecordedSignal } from './cases'
import { severityAtLeast } from './score'

const KIND_LABEL: Record<IntegritySignalKind, string> = {
  [IntegritySignalKind.FLAG_SHARING]: 'Flag sharing',
  [IntegritySignalKind.SHARED_IP]: 'Shared IP',
  [IntegritySignalKind.DUPLICATE_PROOF]: 'Duplicate solver proof',
  [IntegritySignalKind.DUPLICATE_AI_LINK]: 'Duplicate AI link',
  [IntegritySignalKind.SOLVED_WITHOUT_DOWNLOAD]: 'Solved without downloading',
  [IntegritySignalKind.UNLISTED_AI_LINK]: 'Unlisted AI link',
}

type AlertOptions = {
  providers: readonly MessageProvider[]
  minSeverity: IntegritySeverity
}

const namesById = async (
  db: DatabaseClient,
  signals: readonly RecordedSignal[]
) => {
  const teamIds = [
    ...new Set(
      signals.flatMap(({ signal }) =>
        signal.otherTeamId
          ? [signal.teamId, signal.otherTeamId]
          : [signal.teamId]
      )
    ),
  ]
  const challengeIds = [
    ...new Set(
      signals.flatMap(({ signal }) =>
        signal.challengeId ? [signal.challengeId] : []
      )
    ),
  ]
  const [teamRows, challengeRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, teamIds)),
    challengeIds.length === 0
      ? []
      : db
          .select({ id: challenges.id, data: challenges.data })
          .from(challenges)
          .where(inArray(challenges.id, challengeIds)),
  ])
  return {
    teams: new Map(teamRows.map(row => [row.id, row.name])),
    challenges: new Map(
      challengeRows.map(row => [
        row.id,
        `${row.data.category}/${row.data.name}`,
      ])
    ),
  }
}

// Sends one message per new signal at or above the minimum severity, to
// every configured destination. Signals on dismissed cases stay quiet.
export const alertNewSignals = async (
  db: DatabaseClient,
  recorded: readonly RecordedSignal[],
  { providers, minSeverity }: AlertOptions
): Promise<void> => {
  const alertable = recorded.filter(
    ({ signal, case: kase }) =>
      kase.status !== IntegrityCaseStatus.DISMISSED &&
      severityAtLeast(signal.severity, minSeverity)
  )
  if (alertable.length === 0 || providers.length === 0) return

  const names = await namesById(db, alertable)
  await Promise.all(
    providers.flatMap(provider =>
      alertable.map(({ signal, case: kase }) => {
        const team = (id: string) =>
          `\`${provider.escapeText(names.teams.get(id) ?? id)}\``
        const teams = signal.otherTeamId
          ? ` between ${team(signal.teamId)} and ${team(signal.otherTeamId)}`
          : ` by ${team(signal.teamId)}`
        const challenge = signal.challengeId
          ? ` on \`${provider.escapeText(names.challenges.get(signal.challengeId) ?? signal.challengeId)}\``
          : ''
        const url = new URL(
          `/admin/integrity?case=${kase.id}`,
          config.origin
        ).toString()
        return provider.sendMarkdown(
          `Integrity alert (${signal.severity}): ${KIND_LABEL[signal.kind]}${teams}${challenge}. [Review case](${provider.escapeUrl(url)})`
        )
      })
    )
  )
}
