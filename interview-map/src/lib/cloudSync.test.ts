import { describe, it, expect } from 'vitest'
import { mergeStudied, mergeQuizStats } from './cloudSync'

describe('mergeStudied', () => {
  it('unions local and cloud ids without duplicates', () => {
    expect(mergeStudied(['a', 'b'], ['b', 'c']).sort()).toEqual(['a', 'b', 'c'])
  })
  it('handles empty sides', () => {
    expect(mergeStudied([], ['x']).sort()).toEqual(['x'])
    expect(mergeStudied(['y'], []).sort()).toEqual(['y'])
    expect(mergeStudied([], [])).toEqual([])
  })
  it('does not mutate inputs', () => {
    const local = ['a']; const cloud = ['b']
    mergeStudied(local, cloud)
    expect(local).toEqual(['a']); expect(cloud).toEqual(['b'])
  })
})

describe('mergeQuizStats', () => {
  it('takes the field-wise max per domain, keeping the richer record', () => {
    const local = { os: { correct: 6, seen: 10 }, net: { correct: 1, seen: 1 } }
    const cloud = { os: { correct: 3, seen: 5 }, db: { correct: 2, seen: 4 } }
    expect(mergeQuizStats(local, cloud)).toEqual({
      os: { correct: 6, seen: 10 },
      net: { correct: 1, seen: 1 },
      db: { correct: 2, seen: 4 },
    })
  })

  it('is idempotent — merging equal sides returns the same values', () => {
    const s = { os: { correct: 3, seen: 5 } }
    expect(mergeQuizStats(s, s)).toEqual({ os: { correct: 3, seen: 5 } })
  })

  it('never yields correct > seen across mixed sources', () => {
    const local = { os: { correct: 5, seen: 5 } }   // perfect but few
    const cloud = { os: { correct: 1, seen: 20 } }  // many but weak
    const m = mergeQuizStats(local, cloud).os
    expect(m.correct).toBeLessThanOrEqual(m.seen)
    expect(m).toEqual({ correct: 5, seen: 20 })
  })

  it('handles empty sides', () => {
    expect(mergeQuizStats({}, { x: { correct: 1, seen: 2 } })).toEqual({ x: { correct: 1, seen: 2 } })
    expect(mergeQuizStats({ y: { correct: 0, seen: 1 } }, {})).toEqual({ y: { correct: 0, seen: 1 } })
    expect(mergeQuizStats({}, {})).toEqual({})
  })

  it('does not mutate inputs', () => {
    const local = { os: { correct: 1, seen: 2 } }
    const cloud = { os: { correct: 3, seen: 4 } }
    mergeQuizStats(local, cloud)
    expect(local).toEqual({ os: { correct: 1, seen: 2 } })
    expect(cloud).toEqual({ os: { correct: 3, seen: 4 } })
  })
})
