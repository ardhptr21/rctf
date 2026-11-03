import type { Challenge, DatabaseClient, User } from '@rctf/db'
import type {
  BadChallenge,
  BadEndpoint,
  BadInstancerError,
  BadRateLimit,
  GoodInstancerActionResult,
  ResponseHelpers,
} from '@rctf/types'
import { InstanceEndReason, InstanceStatus } from '@rctf/types'
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
import { isAdminUser } from './settings'

export interface InstanceRequest {
  res: InstancerResponseHelpers
  db: DatabaseClient
  user: User
  challengeId: string
  includeHidden?: boolean
  // set by the player-facing routes, which record the instance history
  history?: InstanceHistoryContext
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

export const createInstance = (
  request: InstanceRequest
): Promise<InstanceResponse> =>
  withInstancerChallenge(
    request,
    async (challenge, provider) =>
      provider.createInstance(
        await buildCreateInstanceOptions(request.db, challenge, request.user)
      ),
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
