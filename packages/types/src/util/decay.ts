// CTFd's "logarithmic" decay, which is really a parabola: the value falls
// slowly at first, then faster, reaching the minimum after `decay` solves.
// The first solve counts as zero, so it keeps the full value.
export const logarithmicDecay = ({
  minPoints,
  maxPoints,
  solves,
  decay,
}: {
  minPoints: number
  maxPoints: number
  solves: number
  decay: number
}): number => {
  const counted = Math.max(solves - 1, 0)
  const value =
    ((minPoints - maxPoints) / (decay * decay)) * counted * counted + maxPoints
  return Math.round(Math.max(Math.min(value, maxPoints), minPoints))
}
