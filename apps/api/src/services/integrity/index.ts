import { config } from '@rctf/config'
import { users, type DatabaseClient } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import { eq } from 'drizzle-orm'
import type { PinoLogger } from 'hono-pino'
import type { TypedRedis } from '../../cache/scripts'
import { integrityAlertProviders } from '../../providers/instances/integrity-alerts'
import { getResolvedSettings, isAdminUser } from '../settings'
import { alertNewSignals } from './alerts'
import { recordSignals } from './cases'
import { detectSignals, type IntegrityAttempt } from './detectors'

export type { IntegrityAttempt } from './detectors'

// Checks one flag submission for signs of cheating and records what it
// finds. Admin teams are skipped: they test challenges and don't score.
// Never throws, so it can run in the background of a submission.
export const scanAttempt = async (
  db: DatabaseClient,
  redis: TypedRedis,
  log: PinoLogger,
  attempt: IntegrityAttempt
): Promise<void> => {
  try {
    const { integrity, aiLinkPatterns } = await getResolvedSettings(db, redis)
    if (!Object.values(integrity.detectors).some(Boolean)) return

    const submitter = await db
      .select({ perms: users.perms })
      .from(users)
      .where(eq(users.id, attempt.teamId))
      .then(takeUnique)
    if (!submitter || isAdminUser(submitter)) return

    const recorded = await recordSignals(
      db,
      await detectSignals(db, attempt, { integrity, aiLinkPatterns })
    )
    if (recorded.length > 0 && integrity.alerts) {
      await alertNewSignals(db, recorded, {
        providers: integrityAlertProviders,
        minSeverity: config.integrity.alertMinSeverity,
      })
    }
  } catch (err) {
    log.error(
      { err, teamId: attempt.teamId, challengeId: attempt.challengeId },
      'integrity scan failed'
    )
  }
}
