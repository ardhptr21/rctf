import type { Player } from '@rctf/db'
import type { ApiContext } from '../../../lib/app-env'

// playerAuth routes always run with a player set by the router
export const playerOf = (ctx: ApiContext): Player => ctx.var.player!

// team service errors are named after the response kinds they map to
export const respondTeamError = <
  TRes extends Record<string, (...args: any[]) => any>,
>(
  res: TRes,
  error: string
): ReturnType<TRes[keyof TRes]> => {
  const responder = res[error]
  if (!responder) {
    throw new Error(`Unhandled team error: ${error}`)
  }
  return responder()
}
