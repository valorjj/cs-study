import { describe, it, expect } from 'vitest'
import { tierOf, type MasteryEvidence } from './mastery'
import type { SrsCard } from './srs'

const card = (reps: number, lapses: number): SrsCard =>
  ({ ef: 2.5, interval: 6, reps, lapses, due: '2026-08-10' })

const ev = (over: Partial<MasteryEvidence> = {}): MasteryEvidence => ({
  srsKeysByNode: new Map([['n1', ['k1', 'k2']]]),
  srs: {},
  quizStats: {},
  domainOfNode: () => 'database',
  ...over,
})

describe('tierOf', () => {
  it('is unverified when the node has no cards at all', () => {
    expect(tierOf('unknown-node', ev())).toBe('unverified')
  })

  it('is unverified when the node has cards but none have srs records', () => {
    expect(tierOf('n1', ev())).toBe('unverified')
  })

  it('is shaky when any card has lapsed, even if another card looks solid', () => {
    expect(tierOf('n1', ev({ srs: { k1: card(5, 0), k2: card(0, 2) } }))).toBe('shaky')
  })

  it('is shaky when the domain accuracy is below 0.8 with enough attempts', () => {
    expect(tierOf('n1', ev({
      srs: { k1: card(3, 0) },
      quizStats: { database: { correct: 5, seen: 10 } },
    }))).toBe('shaky')
  })

  it('ignores domain accuracy below the seen>=3 threshold', () => {
    expect(tierOf('n1', ev({
      srs: { k1: card(3, 0) },
      quizStats: { database: { correct: 0, seen: 2 } },
    }))).toBe('solid')
  })

  it('is shaky when the best card has fewer than 2 reps', () => {
    expect(tierOf('n1', ev({ srs: { k1: card(1, 0) } }))).toBe('shaky')
  })

  it('is solid at reps>=2 with no lapses and a healthy domain', () => {
    expect(tierOf('n1', ev({
      srs: { k1: card(2, 0) },
      quizStats: { database: { correct: 9, seen: 10 } },
    }))).toBe('solid')
  })

  it('checks lapses before domain accuracy so the stronger signal wins the label', () => {
    // 둘 다 shaky를 가리키지만, 우선순위 규칙이 lapses에서 멈추는지 확인한다.
    expect(tierOf('n1', ev({
      srs: { k1: card(9, 3) },
      quizStats: { database: { correct: 1, seen: 10 } },
    }))).toBe('shaky')
  })
})
