import {
  challengeDownloads,
  challenges,
  submissions,
  users,
  type DatabaseClient,
} from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import {
  IntegritySeverity,
  IntegritySignalKind,
  isNoAi,
  type IntegritySettings,
} from '@rctf/types'
import { and, eq, gte, ne, sql, type SQL } from 'drizzle-orm'
import { scoredUserJoin } from '../challenge-queries'
import { matchesAiLinkPatterns } from './ai-link-patterns'
import { isAllowlistedIp } from './ip-allowlist'

// One flag submission, as the detectors see it.
export type IntegrityAttempt = {
  teamId: string
  challengeId: string
  ip: string
  flag: string
  aiLinks: readonly string[]
  proof: { sha256: string; name: string } | null
  // whether the flag was accepted (a solve, or another team's flag)
  solved: boolean
  // the team whose dynamic flag was submitted, when it wasn't this team's
  cheatedFrom: string | null
}

export type SignalDraft = {
  kind: IntegritySignalKind
  severity: IntegritySeverity
  teamId: string
  otherTeamId: string | null
  challengeId: string | null
  evidence: Record<string, unknown>
  // identifies the piece of evidence, so the same evidence for the same
  // pair is only ever recorded once
  fingerprint: string
}

// The settings the detectors read: the cheat detection settings, plus the
// allowed AI link patterns, which belong to the submission settings.
export type DetectorContext = {
  integrity: IntegritySettings
  aiLinkPatterns: readonly string[]
}

type Detector = (
  db: DatabaseClient,
  attempt: IntegrityAttempt,
  context: DetectorContext
) => Promise<SignalDraft[]>

// enough to show a pattern without one attempt fanning out into hundreds
// of signals
const MAX_MATCHES = 25

const otherScoredTeams = (
  db: DatabaseClient,
  attempt: IntegrityAttempt,
  ...conditions: SQL[]
) =>
  db
    .selectDistinct({ teamId: submissions.userId })
    .from(submissions)
    .innerJoin(users, scoredUserJoin(submissions.userId))
    .where(and(ne(submissions.userId, attempt.teamId), ...conditions))
    .limit(MAX_MATCHES)

const flagSharing: Detector = async (_db, attempt) =>
  attempt.cheatedFrom
    ? [
        {
          kind: IntegritySignalKind.FLAG_SHARING,
          severity: IntegritySeverity.HIGH,
          teamId: attempt.teamId,
          otherTeamId: attempt.cheatedFrom,
          challengeId: attempt.challengeId,
          evidence: { flag: attempt.flag },
          fingerprint: 'flag',
        },
      ]
    : []

const sharedIp: Detector = async (db, attempt, { integrity }) => {
  if (
    attempt.ip === 'unknown' ||
    isAllowlistedIp(attempt.ip, integrity.ipAllowlist)
  ) {
    return []
  }
  const since = new Date(
    Date.now() - integrity.sharedIpWindowHours * 60 * 60 * 1000
  ).toISOString()
  const matches = await otherScoredTeams(
    db,
    attempt,
    eq(submissions.ip, attempt.ip),
    gte(submissions.createdAt, since)
  )
  return matches.map(match => ({
    kind: IntegritySignalKind.SHARED_IP,
    severity: IntegritySeverity.MEDIUM,
    teamId: attempt.teamId,
    otherTeamId: match.teamId,
    challengeId: null,
    evidence: { ip: attempt.ip },
    fingerprint: attempt.ip,
  }))
}

const duplicateProof: Detector = async (db, attempt) => {
  const proof = attempt.proof
  if (!proof) return []
  const matches = await otherScoredTeams(
    db,
    attempt,
    eq(submissions.challengeId, attempt.challengeId),
    sql`${submissions.details} -> 'proof' ->> 'sha256' = ${proof.sha256}`
  )
  return matches.map(match => ({
    kind: IntegritySignalKind.DUPLICATE_PROOF,
    severity: IntegritySeverity.HIGH,
    teamId: attempt.teamId,
    otherTeamId: match.teamId,
    challengeId: attempt.challengeId,
    evidence: { sha256: proof.sha256, name: proof.name },
    fingerprint: proof.sha256,
  }))
}

// the AI links that point somewhere, without repeats or "no ai"
const realAiLinks = (attempt: IntegrityAttempt): string[] =>
  [...new Set(attempt.aiLinks.map(link => link.trim()))].filter(
    link => link !== '' && !isNoAi(link)
  )

const duplicateAiLink: Detector = async (db, attempt) => {
  const links = realAiLinks(attempt)
  if (links.length === 0) return []

  const rows = await db
    .selectDistinct({
      teamId: submissions.userId,
      links: sql<string[]>`${submissions.details} -> 'aiLinks'`,
    })
    .from(submissions)
    .innerJoin(users, scoredUserJoin(submissions.userId))
    .where(
      and(
        ne(submissions.userId, attempt.teamId),
        eq(submissions.challengeId, attempt.challengeId),
        sql`jsonb_exists_any(${submissions.details} -> 'aiLinks', ARRAY[${sql.join(
          links.map(link => sql`${link}`),
          sql`, `
        )}]::text[])`
      )
    )
    .limit(MAX_MATCHES)

  return rows.flatMap(row => {
    const shared = new Set((row.links ?? []).map(link => link.trim()))
    return links
      .filter(link => shared.has(link))
      .map(link => ({
        kind: IntegritySignalKind.DUPLICATE_AI_LINK,
        severity: IntegritySeverity.MEDIUM,
        teamId: attempt.teamId,
        otherTeamId: row.teamId,
        challengeId: attempt.challengeId,
        evidence: { link },
        fingerprint: Bun.hash(link).toString(36),
      }))
  })
}

// AI links from sites outside the allowed patterns. Off until patterns are
// set, since an empty list would flag every link.
const unlistedAiLink: Detector = async (_db, attempt, { aiLinkPatterns }) => {
  if (aiLinkPatterns.length === 0) return []
  return realAiLinks(attempt)
    .filter(link => !matchesAiLinkPatterns(link, aiLinkPatterns))
    .map(link => ({
      kind: IntegritySignalKind.UNLISTED_AI_LINK,
      severity: IntegritySeverity.MEDIUM,
      teamId: attempt.teamId,
      otherTeamId: null,
      challengeId: attempt.challengeId,
      evidence: { link },
      fingerprint: Bun.hash(link).toString(36),
    }))
}

// A solve of a challenge with attachments that the team never downloaded
// through the challenge page.
const solvedWithoutDownload: Detector = async (db, attempt) => {
  if (!attempt.solved) return []
  const row = await db
    .select({
      files: sql<number>`jsonb_array_length(COALESCE(${challenges.data} -> 'files', '[]'::jsonb))`,
      downloaded: sql<boolean>`EXISTS (
        SELECT 1 FROM ${challengeDownloads}
        WHERE ${challengeDownloads.teamId} = ${attempt.teamId}
          AND ${challengeDownloads.challengeId} = ${challenges.id}
      )`,
    })
    .from(challenges)
    .where(eq(challenges.id, attempt.challengeId))
    .then(takeUnique)
  if (!row || row.files === 0 || row.downloaded) return []
  return [
    {
      kind: IntegritySignalKind.SOLVED_WITHOUT_DOWNLOAD,
      severity: IntegritySeverity.MEDIUM,
      teamId: attempt.teamId,
      otherTeamId: null,
      challengeId: attempt.challengeId,
      evidence: { files: row.files },
      fingerprint: 'solve',
    },
  ]
}

const DETECTORS: Record<keyof IntegritySettings['detectors'], Detector> = {
  flagSharing,
  sharedIp,
  duplicateProof,
  duplicateAiLink,
  unlistedAiLink,
  solvedWithoutDownload,
}

// Runs the detectors switched on in the cheat detection settings.
export const detectSignals = async (
  db: DatabaseClient,
  attempt: IntegrityAttempt,
  context: DetectorContext
): Promise<SignalDraft[]> => {
  const enabled = (
    Object.keys(DETECTORS) as Array<keyof typeof DETECTORS>
  ).filter(name => context.integrity.detectors[name])
  const results = await Promise.all(
    enabled.map(name => DETECTORS[name](db, attempt, context))
  )
  return results.flat()
}
