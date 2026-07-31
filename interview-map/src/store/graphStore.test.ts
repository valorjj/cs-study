import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from './graphStore'
import { QUIZSETTINGS_KEY, DEFAULT_QUIZ_SETTINGS } from '../lib/quizSettings'

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

describe('setQuizSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ quizSettings: { ...DEFAULT_QUIZ_SETTINGS } })
  })

  it('merges a partial patch over current settings', () => {
    useGraphStore.getState().setQuizSettings({ order: 'random' })
    expect(useGraphStore.getState().quizSettings).toEqual({
      order: 'random', newCardCap: 15, gradeButtons: 3,
    })
  })

  it('persists to localStorage', () => {
    useGraphStore.getState().setQuizSettings({ newCardCap: 30 })
    expect(JSON.parse(localStorage.getItem(QUIZSETTINGS_KEY)!)).toEqual({
      order: 'daily', newCardCap: 30, gradeButtons: 3,
    })
  })
})

describe('quizMode', () => {
  it('defaults to flash', () => {
    // getInitialState() reads the store's declared initial value, not whatever
    // an earlier test left behind.
    expect(useGraphStore.getInitialState().quizMode).toBe('flash')
  })

  it('setQuizMode switches the active quiz sub-tab', () => {
    useGraphStore.getState().setQuizMode('drill')
    expect(useGraphStore.getState().quizMode).toBe('drill')
  })
})

describe('trackId', () => {
  it('defaults to null so PathView falls back to the first track', () => {
    expect(useGraphStore.getInitialState().trackId).toBeNull()
  })

  it('setTrackId selects a course and survives a view switch', () => {
    useGraphStore.getState().setTrackId('curated:junior-backend')
    useGraphStore.getState().setViewMode('list')
    expect(useGraphStore.getState().trackId).toBe('curated:junior-backend')
  })
})
