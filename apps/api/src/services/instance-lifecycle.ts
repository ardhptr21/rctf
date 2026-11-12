import {
  challenges,
  instanceHistory,
  type Challenge,
  type DatabaseClient,
  type User,
} from '@rctf/db'
import type {
  BadChallenge,
  BadEndpoint,
  BadInstancerError,
  BadRateLimit,
  GoodInstancerActionResult,
  ResponseHelpers,
} from '@rctf/types'
import { InstanceEndReason, InstanceStatus } from '@rctf/types'
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm'
import type { PinoLogger } from 'hono-pino'
import type { TypedRedis } from '../cache/scripts'
import type {
  InstanceQueryOptions,
  instanceDetailsOrError,
  InstancerProvider,
} from '../providers/instancer/base'
import { inferChallengeIntegrationId } from '../util/instancer'
import {
  recordInstanceExtend,
  recordInstanceStart,
  recordInstanceStatus,
  recordInstanceStop,
  type InstanceHistoryContext,
} from './instance-history'
import {
  buildCreateInstanceOptions,
  filterInstanceEndpoints,
  getInstancerChallenge,
  getInstancerProvider,
  resolveInstancerName,
  returnInstanceStatusOrError,
  type InstancerResponseHelpers,
} from './instancer'
import { rateLimitInstancerAction } from './rate-limit'
import { getResolvedSettings, isAdminUser } from './settings'

export interface InstanceRequest {
  res: InstancerResponseHelpers
  db: DatabaseClient
  user: User
  challengeId: string
  includeHidden?: boolean
  // set by the player-facing routes, which record the instance history
  history?: InstanceHistoryContext
  redis?: TypedRedis
}

type InstanceResponse = ReturnType<
  InstancerResponseHelpers[keyof InstancerResponseHelpers]
>

type InstanceActionResponseHelpers = ResponseHelpers<
  [
    typeof GoodInstancerActionResult,
    typeof BadInstancerError,
    typeof BadEndpoint,
    typeof BadChallenge,
    typeof BadRateLimit,
  ]
>

export interface InstanceActionRequest {
  res: InstanceActionResponseHelpers
  db: DatabaseClient
  redis: TypedRedis
  user: User
  challengeId: string
  actionId: string
  includeHidden?: boolean
}

type InstanceActionResponse = ReturnType<
  InstanceActionResponseHelpers[keyof InstanceActionResponseHelpers]
>

const instancerError = (message: string): instanceDetailsOrError => ({
  kind: 'instancerError',
  message,
})

const instanceQueryOptions = (
  user: User,
  challenge: Challenge
): InstanceQueryOptions => ({
  teamId: user.id,
  challengeIntegrationId: inferChallengeIntegrationId(challenge),
  config: challenge.data.instancerConfig!.config,
})

type HistoryRecorder = typeof recordInstanceStart

const withInstancerChallenge = async (
  { res, db, user, challengeId, includeHidden, history }: InstanceRequest,
  run: (
    challenge: Challenge,
    provider: InstancerProvider
  ) => Promise<instanceDetailsOrError>,
  record: HistoryRecorder
): Promise<InstanceResponse> => {
  const { challenge, provider, error } = await getInstancerChallenge(
    res,
    db,
    challengeId,
    { includeHidden }
  )
  if (error) {
    return error
  }

  const instanceStatus = await run(challenge, provider)
  // admin teams only test challenges, so their instances aren't recorded
  if (history && !isAdminUser(user)) {
    await record(
      db,
      history,
      { teamId: user.id, challengeId: challenge.id },
      instanceStatus
    )
  }
  return await returnInstanceStatusOrError(
    res,
    filterInstanceEndpoints(instanceStatus, challenge)
  )
}

export const getInstanceStatus = (
  request: InstanceRequest
): Promise<InstanceResponse> =>
  withInstancerChallenge(
    request,
    (challenge, provider) =>
      provider.getInstance(instanceQueryOptions(request.user, challenge)),
    recordInstanceStatus
  )

const isLiveStatus = (status: InstanceStatus) =>
  status === InstanceStatus.RUNNING || status === InstanceStatus.STARTING

// The names of the team's other running instances when they already reach
// `instancerMaxPerTeam`, or null when another may start. Open history entries
// can be stale (an instance that expired unseen), so at the limit each one is
// checked with its instancer, which also closes the entries of those gone.
const instancesOverLimit = async (
  { db, redis, user, history }: InstanceRequest,
  challenge: Challenge
): Promise<string[] | null> => {
  // only the player-facing routes count, and admin teams are exempt
  if (!history || isAdminUser(user)) return null
  const { instancerMaxPerTeam: limit } = await getResolvedSettings(db, redis)
  if (!limit) return null

  const open = await db
    .select({ challengeId: instanceHistory.challengeId, challenge: challenges })
    .from(instanceHistory)
    .innerJoin(challenges, eq(challenges.id, instanceHistory.challengeId))
    .where(
      and(
        eq(instanceHistory.teamId, user.id),
        // starting a running instance again just returns it
        ne(instanceHistory.challengeId, challenge.id),
        isNull(instanceHistory.endedAt),
        or(
          isNull(instanceHistory.expiresAt),
          gt(instanceHistory.expiresAt, sql`now()`)
        )
      )
    )
  if (open.length < limit) return null

  const live: string[] = []
  for (const entry of open) {
    const other = entry.challenge
    const config = other.data.instancerConfig
    const provider = config
      ? getInstancerProvider(resolveInstancerName(config))
      : undefined
    if (!provider) continue
    const details = await provider.getInstance(
      instanceQueryOptions(user, other)
    )
    await recordInstanceStatus(
      db,
      history,
      { teamId: user.id, challengeId: entry.challengeId },
      details
    )
    if (
      details.kind === 'instancerInstanceDetails' &&
      isLiveStatus(details.status)
    ) {
      live.push(other.data.name)
    }
  }
  return live.length >= limit ? live : null
}

const limitMessage = (running: string[]) =>
  `Your team can run ${running.length === 1 ? '1 instance' : `${running.length} instances`} at a time. Stop one first: ${running.join(', ')}.`

export const createInstance = (
  request: InstanceRequest
): Promise<InstanceResponse> =>
  withInstancerChallenge(
    request,
    async (challenge, provider) => {
      const running = await instancesOverLimit(request, challenge)
      if (running) {
        return instancerError(limitMessage(running))
      }
      return provider.createInstance(
        await buildCreateInstanceOptions(request.db, challenge, request.user)
      )
    },
    recordInstanceStart
  )

export const deleteInstance = (
  request: InstanceRequest
): Promise<InstanceResponse> =>
  withInstancerChallenge(
    request,
    async (challenge, provider) => {
      if (!provider.capabilities.canStop) {
        return instancerError('Stopping is disabled for this instancer')
      }

      return await provider.deleteInstance(
        instanceQueryOptions(request.user, challenge)
      )
    },
    recordInstanceStop
  )

export const extendInstance = (
  request: InstanceRequest
): Promise<InstanceResponse> =>
  withInstancerChallenge(
    request,
    async (challenge, provider) => {
      if (!provider.capabilities.canExtend) {
        return instancerError('Extending is disabled for this instancer')
      }

      const instancerConfig = challenge.data.instancerConfig!
      if (instancerConfig.extendable === false) {
        return instancerError('Extending is disabled for this challenge')
      }

      return await provider.extendInstance({
        ...instanceQueryOptions(request.user, challenge),
        timeoutMilliseconds: instancerConfig.timeoutMilliseconds,
      })
    },
    recordInstanceExtend
  )

export const runInstanceAction = async ({
  res,
  db,
  redis,
  user,
  challengeId,
  actionId,
  includeHidden,
}: InstanceActionRequest): Promise<InstanceActionResponse> => {
  const { challenge, provider, error } = await getInstancerChallenge(
    res,
    db,
    challengeId,
    { includeHidden }
  )
  if (error) {
    return error
  }

  const action = provider.actions?.find(a => a.id === actionId)
  if (!action || !provider.runAction) {
    return res.badInstancerError({ message: 'Unknown instancer action' })
  }

  if (action.rateLimit) {
    const timeLeft = await rateLimitInstancerAction(
      redis,
      user.id,
      challengeId,
      action.id,
      action.rateLimit.burst,
      action.rateLimit.intervalMilliseconds
    )
    if (timeLeft !== undefined) {
      return res.badRateLimit({ timeLeft })
    }
  }

  const outcome = await provider.runAction(
    action.id,
    instanceQueryOptions(user, challenge)
  )
  if (outcome.kind === 'instancerError') {
    return res.badInstancerError(outcome)
  }

  return res.goodInstancerActionResult({
    message: outcome.message ?? null,
    submitFlag: outcome.submitFlag ?? null,
  })
}

// Once a team solves an instanced challenge it no longer needs the
// instance, so it is stopped to free the resources. Admin teams keep theirs,
// since they solve challenges to test them. Never throws, so it can run in
// the background of a solve.
export const stopInstanceAfterSolve = async (
  db: DatabaseClient,
  log: PinoLogger,
  { user, challenge }: { user: User; challenge: Challenge }
): Promise<void> => {
  const instancerConfig = challenge.data.instancerConfig
  if (!instancerConfig || isAdminUser(user)) return
  const provider = getInstancerProvider(resolveInstancerName(instancerConfig))
  if (!provider?.capabilities.canStop) return

  const query = instanceQueryOptions(user, challenge)
  const key = { teamId: user.id, challengeId: challenge.id }
  const history = { playerId: null, ip: '', log }
  try {
    const current = await provider.getInstance(query)
    if (
      current.kind !== 'instancerInstanceDetails' ||
      current.status === InstanceStatus.STOPPED ||
      current.status === InstanceStatus.STOPPING
    ) {
      // nothing running; close any entry left open for it
      await recordInstanceStatus(db, history, key, current)
      return
    }
    const stopped = await provider.deleteInstance(query)
    if (stopped.kind === 'instancerError') {
      log.warn(
        { teamId: user.id, challengeId: challenge.id, error: stopped.message },
        'could not stop instance after solve'
      )
      return
    }
    await recordInstanceStop(
      db,
      history,
      key,
      stopped,
      InstanceEndReason.SOLVED
    )
  } catch (err) {
    log.error(
      { err, teamId: user.id, challengeId: challenge.id },
      'stopping instance after solve failed'
    )
  }
}
