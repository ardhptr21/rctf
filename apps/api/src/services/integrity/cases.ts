import {
  challenges,
  integrityCases,
  integritySignals,
  users,
  type DatabaseClient,
  type DatabaseTx,
  type IntegrityCase,
  type IntegritySignal,
} from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import { IntegrityCaseStatus, type IntegritySignalKind } from '@rctf/types'
import { count, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { SignalDraft } from './detectors'
import { caseScore, orderPair, pairKey } from './score'

export type RecordedSignal = {
  signal: IntegritySignal
  case: Pick<IntegrityCase, 'id' | 'status'>
}

const dedupKey = (draft: SignalDraft, key: string): string =>
  [draft.kind, key, draft.challengeId ?? '', draft.fingerprint].join(':')

// Recomputes a case's score and counters from its signals. The case row is
// locked first, so concurrent scans of the same pair don't race.
const refreshCase = async (tx: DatabaseTx, caseId: string): Promise<void> => {
  await tx
    .select({ id: integrityCases.id })
    .from(integrityCases)
    .where(eq(integrityCases.id, caseId))
    .for('update')
  const signals = await tx
    .select({
      kind: integritySignals.kind,
      severity: integritySignals.severity,
    })
    .from(integritySignals)
    .where(eq(integritySignals.caseId, caseId))
  await tx
    .update(integrityCases)
    .set({
      score: caseScore(signals),
      signalCount: signals.length,
      lastSignalAt: sql`NOW()`,
    })
    .where(eq(integrityCases.id, caseId))
}

// Files each draft under its team pair's case and returns only the signals
// that are new; evidence already on record is skipped.
export const recordSignals = async (
  db: DatabaseClient,
  drafts: readonly SignalDraft[]
): Promise<RecordedSignal[]> => {
  if (drafts.length === 0) return []

  return await db.transaction(async tx => {
    const recorded: RecordedSignal[] = []
    for (const draft of drafts) {
      const key = pairKey(draft.teamId, draft.otherTeamId)
      const [teamId, otherTeamId] = orderPair(draft.teamId, draft.otherTeamId)
      // the no-op update makes the existing case come back from returning()
      const [kase] = await tx
        .insert(integrityCases)
        .values({ id: crypto.randomUUID(), teamId, otherTeamId, pairKey: key })
        .onConflictDoUpdate({
          target: integrityCases.pairKey,
          set: { pairKey: key },
        })
        .returning({ id: integrityCases.id, status: integrityCases.status })

      const [signal] = await tx
        .insert(integritySignals)
        .values({
          id: crypto.randomUUID(),
          caseId: kase!.id,
          kind: draft.kind,
          severity: draft.severity,
          teamId: draft.teamId,
          otherTeamId: draft.otherTeamId,
          challengeId: draft.challengeId,
          evidence: draft.evidence,
          dedupKey: dedupKey(draft, key),
        })
        .onConflictDoNothing({ target: integritySignals.dedupKey })
        .returning()
      if (signal) recorded.push({ signal, case: kase! })
    }

    for (const caseId of new Set(recorded.map(entry => entry.case.id))) {
      await refreshCase(tx, caseId)
    }
    return recorded
  })
}

const teamA = alias(users, 'team_a')
const teamB = alias(users, 'team_b')

const caseSelection = {
  case: integrityCases,
  teamName: teamA.name,
  teamBanned: teamA.banned,
  otherTeamName: teamB.name,
  otherTeamBanned: teamB.banned,
  kinds: sql<IntegritySignalKind[]>`ARRAY(
    SELECT DISTINCT ${integritySignals.kind} FROM ${integritySignals}
    WHERE ${integritySignals.caseId} = ${integrityCases.id}
  )`,
}

type CaseRow = {
  case: IntegrityCase
  teamName: string | null
  teamBanned: boolean | null
  otherTeamName: string | null
  otherTeamBanned: boolean | null
  kinds: IntegritySignalKind[]
}

const team = (
  id: string | null,
  name: string | null,
  banned: boolean | null
) =>
  id === null
    ? null
    : // a deleted team keeps its cases, shown by id
      { id, name: name ?? id, banned: banned ?? false }

const toCaseSummary = (row: CaseRow) => ({
  id: row.case.id,
  status: row.case.status,
  score: row.case.score,
  signalCount: row.case.signalCount,
  kinds: row.kinds,
  team: team(row.case.teamId, row.teamName, row.teamBanned)!,
  otherTeam: team(row.case.otherTeamId, row.otherTeamName, row.otherTeamBanned),
  lastSignalAt: new Date(row.case.lastSignalAt).getTime(),
  createdAt: new Date(row.case.createdAt).getTime(),
  note: row.case.note,
  resolvedAt: row.case.resolvedAt
    ? new Date(row.case.resolvedAt).getTime()
    : null,
})

const casesQuery = (db: DatabaseClient) =>
  db
    .select(caseSelection)
    .from(integrityCases)
    .leftJoin(teamA, eq(teamA.id, integrityCases.teamId))
    .leftJoin(teamB, eq(teamB.id, integrityCases.otherTeamId))

export const listCases = async (
  db: DatabaseClient,
  params: { status: IntegrityCaseStatus; limit: number; offset: number }
) => {
  const where = eq(integrityCases.status, params.status)
  const [rows, totalRow] = await Promise.all([
    casesQuery(db)
      .where(where)
      .orderBy(desc(integrityCases.score), desc(integrityCases.lastSignalAt))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ value: count() })
      .from(integrityCases)
      .where(where)
      .then(takeUnique),
  ])
  return { cases: rows.map(toCaseSummary), total: totalRow?.value ?? 0 }
}

export const getCaseDetail = async (db: DatabaseClient, id: string) => {
  const row = await casesQuery(db)
    .where(eq(integrityCases.id, id))
    .then(takeUnique)
  if (!row) return undefined

  const signals = await db
    .select({
      signal: integritySignals,
      challengeName: sql<string | null>`${challenges.data} ->> 'name'`,
      challengeCategory: sql<string | null>`${challenges.data} ->> 'category'`,
    })
    .from(integritySignals)
    .leftJoin(challenges, eq(challenges.id, integritySignals.challengeId))
    .where(eq(integritySignals.caseId, id))
    .orderBy(desc(integritySignals.createdAt))

  return {
    ...toCaseSummary(row),
    signals: signals.map(({ signal, challengeName, challengeCategory }) => ({
      id: signal.id,
      kind: signal.kind,
      severity: signal.severity,
      teamId: signal.teamId,
      otherTeamId: signal.otherTeamId,
      challenge: signal.challengeId
        ? {
            id: signal.challengeId,
            name: challengeName ?? signal.challengeId,
            category: challengeCategory ?? '',
          }
        : null,
      evidence: signal.evidence,
      createdAt: new Date(signal.createdAt).getTime(),
    })),
  }
}

// Dismisses, actions or reopens a case. Reopening clears who resolved it;
// the note is kept unless a new one is given.
export const setCaseStatus = async (
  db: DatabaseClient,
  id: string,
  params: {
    status: IntegrityCaseStatus
    note?: string | undefined
    adminTeamId: string
  }
): Promise<boolean> => {
  const reopened = params.status === IntegrityCaseStatus.OPEN
  const updated = await db
    .update(integrityCases)
    .set({
      status: params.status,
      ...(params.note !== undefined ? { note: params.note || null } : {}),
      resolvedBy: reopened ? null : params.adminTeamId,
      resolvedAt: reopened ? null : sql`NOW()`,
    })
    .where(eq(integrityCases.id, id))
    .returning({ id: integrityCases.id })
  return updated.length > 0
}
