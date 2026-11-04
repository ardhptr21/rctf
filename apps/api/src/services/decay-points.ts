import type { ScoreContext } from '@rctf/scoring/base'
import { ChallengeScoringKind, logarithmicDecay } from '@rctf/types'
import { scoreProvider } from '../providers/instances/score'

// The challenge's logarithmic decay setting, or null when it follows the
// CTF-wide score provider.
export const challengeDecay = (data: {
  scoring?: { kind: ChallengeScoringKind; decay?: number } | null
}): number | null =>
  data.scoring?.kind === ChallengeScoringKind.DECAY
    ? (data.scoring.decay ?? null)
    : null

// A decay challenge's current value: its own logarithmic decay when set,
// otherwise the CTF-wide score provider.
export const decayPoints = (
  decay: number | null,
  context: ScoreContext
): number =>
  decay === null
    ? scoreProvider.calculate(context)
    : logarithmicDecay({
        minPoints: context.minPoints,
        maxPoints: context.maxPoints,
        solves: context.solves,
        decay,
      })
