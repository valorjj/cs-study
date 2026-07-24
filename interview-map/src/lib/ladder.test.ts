import { describe, it, expect } from 'vitest'
import { START_LADDER, advanceLadder, ladderSignal, applySkip } from './ladder'

describe('advanceLadder', () => {
  it('score>=4 climbs to next rung, records reached', () => {
    const a = advanceLadder(START_LADDER, 5)
    expect(a).toEqual({ kind: 'climb', state: { rung: 2, attempts: 0, reached: 1 } })
  })
  it('score>=4 at L4 finishes strong', () => {
    const a = advanceLadder({ rung: 4, attempts: 0, reached: 3 }, 4)
    expect(a).toEqual({ kind: 'node-done', reached: 4, weak: false })
  })
  it('score==3 also climbs (moderate) and records reached', () => {
    const a = advanceLadder({ rung: 2, attempts: 0, reached: 1 }, 3)
    expect(a).toEqual({ kind: 'climb', state: { rung: 3, attempts: 0, reached: 2 } })
  })
  it('score<=2 first attempt offers hint (one retry)', () => {
    const a = advanceLadder({ rung: 2, attempts: 0, reached: 1 }, 1)
    expect(a).toEqual({ kind: 'offer-hint', state: { rung: 2, attempts: 1, reached: 1 } })
  })
  it('score<=2 second attempt finishes; weak only if reached==0', () => {
    expect(advanceLadder({ rung: 1, attempts: 1, reached: 0 }, 2))
      .toEqual({ kind: 'node-done', reached: 0, weak: true })
    expect(advanceLadder({ rung: 2, attempts: 1, reached: 1 }, 2))
      .toEqual({ kind: 'node-done', reached: 1, weak: false })
  })
})

describe('ladderSignal', () => {
  it('maps reached to traversal signal', () => {
    expect(ladderSignal(4)).toBe(4)
    expect(ladderSignal(3)).toBe(3)
    expect(ladderSignal(1)).toBe(3)
    expect(ladderSignal(0)).toBe(2)
  })
})

describe('applySkip', () => {
  it('finishes the node at current reached', () => {
    expect(applySkip({ rung: 4, attempts: 0, reached: 3 }))
      .toEqual({ kind: 'node-done', reached: 3, weak: false })
    expect(applySkip({ rung: 1, attempts: 0, reached: 0 }))
      .toEqual({ kind: 'node-done', reached: 0, weak: true })
  })
})
