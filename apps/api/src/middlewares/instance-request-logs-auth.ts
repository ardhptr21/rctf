import { config } from '@rctf/config'
import { BadEndpoint, BadToken } from '@rctf/types'
import type { MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../lib/app-env'
import { timingSafeEqual } from '../util/timing-safe-equal'

const BEARER = 'Bearer '

// The log shipper sends the shared `instanceRequestLogs.token`. The route
// doesn't exist while no token is configured.
export const instanceRequestLogsAuthMiddleware: MiddlewareHandler<
  AppEnv
> = async (c, next) => {
  const token = config.instanceRequestLogs?.token
  if (!token) {
    return c.json(
      { kind: BadEndpoint.kind, message: BadEndpoint.message },
      BadEndpoint.status as ContentfulStatusCode
    )
  }
  const header = c.req.header('Authorization') ?? ''
  if (
    !header.startsWith(BEARER) ||
    !timingSafeEqual(header.slice(BEARER.length), token)
  ) {
    return c.json(
      { kind: BadToken.kind, message: BadToken.message },
      BadToken.status as ContentfulStatusCode
    )
  }
  await next()
}
