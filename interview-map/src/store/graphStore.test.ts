import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from './graphStore'

describe('recordReview', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ srs: {}, quizStats: {} })
  })

  it('creates an srs card on first review', () => {
    useGraphStore.getState().recordReview('k1', { domain: 'net' }, 5, '2026-07-21')
    const card = useGraphStore.getState().srs['k1']
    expect(card).toBeDefined()
    expect(card.reps).toBe(1)
    expect(card.due).toBe('2026-07-22')
  })

  it('also updates the domain-level quizStats (grade>=3 counts correct)', () => {
    useGraphStore.getState().recordReview('k1', { domain: 'net' }, 5, '2026-07-21')
    useGraphStore.getState().recordReview('k2', { domain: 'net' }, 0, '2026-07-21')
    expect(useGraphStore.getState().quizStats['net']).toEqual({ correct: 1, seen: 2 })
  })

  it('advances an existing card and bumps lapses on failure', () => {
    const s = useGraphStore.getState()
    s.recordReview('k1', { domain: 'net' }, 5, '2026-07-21')
    s.recordReview('k1', { domain: 'net' }, 0, '2026-07-22')
    const card = useGraphStore.getState().srs['k1']
    expect(card.reps).toBe(0)
    expect(card.lapses).toBe(1)
  })

  it('setSrs replaces state', () => {
    useGraphStore.getState().setSrs({ x: { ef: 2.5, interval: 6, reps: 2, lapses: 0, due: '2026-07-30' } })
    expect(Object.keys(useGraphStore.getState().srs)).toEqual(['x'])
  })
})
