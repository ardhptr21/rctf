export type SubmitState =
  | 'archived'
  | 'ended'
  | 'login'
  | 'banned'
  | 'solved'
  | 'form'

export interface SubmitLadderInput {
  isArchived: boolean
  endTime: number
  now: number
  isAuthenticated: boolean
  isBanned: boolean
  isSolved: boolean
}

export function resolveSubmitState(input: SubmitLadderInput): SubmitState {
  if (input.isArchived) return 'archived'
  if (input.now > input.endTime) return 'ended'
  if (!input.isAuthenticated) return 'login'
  if (input.isBanned) return 'banned'
  if (input.isSolved) return 'solved'
  return 'form'
}
