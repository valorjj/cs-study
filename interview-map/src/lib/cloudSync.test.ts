import { describe, it, expect } from 'vitest'
import { mergeStudied } from './cloudSync'

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
