import { describe, it, expect } from 'vitest'
import { srsKeyOf, addDays, review, type SrsCard } from './srs'

describe('srsKeyOf', () => {
  it('is stable for the same question regardless of index/order', () => {
    const a = srsKeyOf('notes/03-network/network-core.md', 'osi-model', 'TCP와 UDP 차이는?')
    const b = srsKeyOf('notes/03-network/network-core.md', 'osi-model', 'TCP와 UDP 차이는?')
    expect(a).toBe(b)
  })
  it('differs when the question text differs', () => {
    const a = srsKeyOf('f.md', 's', 'Q one')
    const b = srsKeyOf('f.md', 's', 'Q two')
    expect(a).not.toBe(b)
  })
  it('differs when the file or slug differs', () => {
    expect(srsKeyOf('f1.md', 's', 'Q')).not.toBe(srsKeyOf('f2.md', 's', 'Q'))
    expect(srsKeyOf('f.md', 's1', 'Q')).not.toBe(srsKeyOf('f.md', 's2', 'Q'))
  })
})

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-07-21', 6)).toBe('2026-07-27')
  })
  it('crosses a month boundary', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
  })
  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('adds zero days', () => {
    expect(addDays('2026-07-21', 0)).toBe('2026-07-21')
  })
})

describe('review', () => {
  const today = '2026-07-21'

  it('first success: interval 1, reps 1, due tomorrow', () => {
    const c = review(undefined, 5, today)
    expect(c.reps).toBe(1)
    expect(c.interval).toBe(1)
    expect(c.due).toBe('2026-07-22')
    expect(c.lapses).toBe(0)
  })

  it('second success: interval 6', () => {
    const first = review(undefined, 4, today)
    const second = review(first, 4, first.due)
    expect(second.reps).toBe(2)
    expect(second.interval).toBe(6)
    expect(second.due).toBe(addDays(first.due, 6))
  })

  it('third success: interval = round(prevInterval * ef)', () => {
    const c1 = review(undefined, 4, today)
    const c2 = review(c1, 4, c1.due)
    const c3 = review(c2, 4, c2.due)
    expect(c3.reps).toBe(3)
    expect(c3.interval).toBe(Math.round(c2.interval * c2.ef))
    expect(c3.interval).toBeGreaterThan(6)
  })

  it('failure resets reps/interval, bumps lapses, due tomorrow', () => {
    const c1 = review(undefined, 5, today)
    const c2 = review(c1, 5, c1.due)
    const fail = review(c2, 0, c2.due)
    expect(fail.reps).toBe(0)
    expect(fail.interval).toBe(1)
    expect(fail.lapses).toBe(1)
    expect(fail.due).toBe(addDays(c2.due, 1))
  })

  it('ease factor rises on grade 5 and never drops below 1.3', () => {
    const easy = review(undefined, 5, today)
    expect(easy.ef).toBeGreaterThan(2.5)
    // repeated failures clamp ef at 1.3
    let c: SrsCard | undefined
    for (let i = 0; i < 20; i++) c = review(c, 0, today)
    expect(c!.ef).toBe(1.3)
  })

  it('grade 3 (애매) counts as a success and keeps ef roughly flat', () => {
    const c = review(undefined, 3, today)
    expect(c.reps).toBe(1)
    expect(c.interval).toBe(1)
    expect(c.ef).toBeCloseTo(2.36, 2)
  })
})

import { buildReviewDeck, dueCount, NEW_CARD_DAILY_CAP, GRADE_SETS } from './srs'

type Card = { srsKey: string; domain: string }
const mk = (n: number, domain = 'net'): Card => ({ srsKey: `k${n}`, domain })

describe('buildReviewDeck', () => {
  const today = '2026-07-21'

  it('includes only cards due on/before today, most-overdue first', () => {
    const pool = [mk(1), mk(2), mk(3)]
    const srs = {
      k1: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-21' },
      k2: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-19' }, // most overdue
      k3: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-25' }, // future
    }
    const deck = buildReviewDeck(pool, srs, today, [])
    expect(deck.map((c) => c.srsKey)).toEqual(['k2', 'k1'])
  })

  it('appends new (unseen) cards after due cards, capped at NEW_CARD_DAILY_CAP', () => {
    const pool = Array.from({ length: NEW_CARD_DAILY_CAP + 5 }, (_, i) => mk(i))
    const deck = buildReviewDeck(pool, {}, today, [])
    expect(deck.length).toBe(NEW_CARD_DAILY_CAP)
  })

  it('orders new cards weak-domain-first', () => {
    const pool = [mk(1, 'strong'), mk(2, 'weak'), mk(3, 'strong')]
    const deck = buildReviewDeck(pool, {}, today, ['weak'])
    expect(deck[0].domain).toBe('weak')
  })

  it('places due cards before new cards', () => {
    const pool = [mk(1), mk(2)]
    const srs = { k2: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-20' } }
    const deck = buildReviewDeck(pool, srs, today, [])
    expect(deck.map((c) => c.srsKey)).toEqual(['k2', 'k1'])
  })
})

describe('dueCount', () => {
  const today = '2026-07-21'
  it('counts due cards plus capped new cards', () => {
    const pool = Array.from({ length: NEW_CARD_DAILY_CAP + 2 }, (_, i) => mk(i + 10))
    const srs = { k10: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-20' } }
    // 1 due (k10) + min(rest new, cap). rest new = pool minus k10 = cap+1 → capped to cap.
    expect(dueCount(pool, srs, today)).toBe(1 + NEW_CARD_DAILY_CAP)
  })
  it('is zero when nothing is due and there are no new cards', () => {
    const pool = [mk(1)]
    const srs = { k1: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-25' } }
    expect(dueCount(pool, srs, today)).toBe(0)
  })
})

describe('buildReviewDeck cap', () => {
  const today = '2026-07-22'
  const pool = Array.from({ length: 25 }, (_, i) => ({ srsKey: `k${i}`, domain: 'os' }))

  it('caps new cards at the given cap', () => {
    expect(buildReviewDeck(pool, {}, today, [], 10)).toHaveLength(10)
  })

  it('defaults to NEW_CARD_DAILY_CAP when cap omitted', () => {
    expect(buildReviewDeck(pool, {}, today, [])).toHaveLength(NEW_CARD_DAILY_CAP)
  })

  it('Infinity cap returns all new cards', () => {
    expect(buildReviewDeck(pool, {}, today, [], Infinity)).toHaveLength(25)
  })
})

describe('dueCount cap', () => {
  const today = '2026-07-22'
  const pool = Array.from({ length: 25 }, (_, i) => ({ srsKey: `k${i}`, domain: 'os' }))
  it('respects the cap for new cards', () => {
    expect(dueCount(pool, {}, today, 10)).toBe(10)
    expect(dueCount(pool, {}, today, Infinity)).toBe(25)
  })
})

describe('GRADE_SETS', () => {
  it('has 2/3/5 button sets with ascending grades', () => {
    for (const n of [2, 3, 5] as const) {
      const set = GRADE_SETS[n]
      expect(set).toHaveLength(n)
      const grades = set.map((g) => g.grade)
      expect(grades).toEqual([...grades].sort((a, b) => a - b))
      expect(grades[0]).toBe(0)
      expect(grades[grades.length - 1]).toBe(5)
    }
  })
})
