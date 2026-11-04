import { logarithmicDecay } from '@rctf/types'
import { describe, expect, test } from 'bun:test'

const value = (solves: number, decay = 20, minPoints = 100, maxPoints = 500) =>
  logarithmicDecay({ minPoints, maxPoints, solves, decay })

describe('logarithmicDecay', () => {
  test('follows CTFd: the first solve keeps the full value', () => {
    expect([0, 1, 2, 3, 5, 10, 15, 20].map(solves => value(solves))).toEqual([
      500, 500, 499, 496, 484, 419, 304, 139,
    ])
  })

  test('reaches the minimum after `decay` more solves and stays there', () => {
    expect(value(21)).toBe(100)
    expect(value(22)).toBe(100)
    expect(value(1000)).toBe(100)
  })

  test('handles the edge cases', () => {
    // a decay of 1 drops to the minimum on the second solve
    expect([1, 2, 3].map(solves => value(solves, 1))).toEqual([500, 100, 100])
    // nothing to decay between equal bounds
    expect(value(10, 5, 300, 300)).toBe(300)
    // the value is rounded
    expect(Number.isInteger(value(7, 13, 37, 911))).toBe(true)
  })
})
