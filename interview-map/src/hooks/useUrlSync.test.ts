import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUrlSync } from './useUrlSync'
import { useGraphStore } from '../store/graphStore'

function setHash(h: string) {
  window.history.replaceState(null, '', h)
}

describe('useUrlSync', () => {
  beforeEach(() => {
    localStorage.clear()
    setHash('#/home')
    useGraphStore.setState({ viewMode: 'home', selectedId: null, trackId: null, quizMode: 'flash' })
  })

  it('applies the initial hash to the store', () => {
    setHash('#/list/dsa-bigo')
    renderHook(() => useUrlSync())
    const s = useGraphStore.getState()
    expect(s.viewMode).toBe('list')
    expect(s.selectedId).toBe('dsa-bigo')
  })

  it('canonicalises a non-canonical hash without adding a history entry', () => {
    setHash('#/quiz')
    const before = window.history.length
    renderHook(() => useUrlSync())
    expect(window.location.hash).toBe('#/quiz/flash')
    expect(window.history.length).toBe(before)
  })

  it('restores the saved view mode when the hash is empty', () => {
    localStorage.setItem('interview-map.viewMode.v1', 'guide')
    setHash('#')
    renderHook(() => useUrlSync())
    expect(useGraphStore.getState().viewMode).toBe('guide')
    expect(window.location.hash).toBe('#/guide')
  })

  it('pushes a history entry when the store navigates', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().openNote('dsa-bigo')
    expect(window.location.hash).toBe('#/list/dsa-bigo')
    expect(window.history.length).toBe(before + 1)
  })

  it('pushes exactly one entry per navigation, across two navigations', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().setViewMode('path')
    useGraphStore.getState().setTrackId('curated:junior-backend')
    expect(window.history.length).toBe(before + 2)
    expect(window.location.hash).toBe('#/path/curated:junior-backend')
  })

  it('does not push when unrelated state changes', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().toggleStudied('dsa-bigo')
    expect(window.history.length).toBe(before)
  })

  it('preserves quizMode across a popstate that lands on a non-quiz view', () => {
    // Repro from findings: set drill mode -> push #/home -> back to #/quiz/drill
    // (restored) -> forward to #/home again must NOT reset quizMode to 'flash',
    // since parseHash defaults quizMode to 'flash' for every non-quiz view.
    renderHook(() => useUrlSync())
    useGraphStore.getState().setQuizMode('drill')
    useGraphStore.getState().setViewMode('home')
    expect(window.location.hash).toBe('#/home')

    setHash('#/quiz/drill')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().quizMode).toBe('drill')

    setHash('#/home')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useGraphStore.getState().viewMode).toBe('home')
    expect(useGraphStore.getState().quizMode).toBe('drill')
  })

  it('applies popstate back to the store', () => {
    renderHook(() => useUrlSync())
    useGraphStore.getState().openNote('dsa-bigo')

    setHash('#/path/curated:junior-backend')
    window.dispatchEvent(new PopStateEvent('popstate'))

    const s = useGraphStore.getState()
    expect(s.viewMode).toBe('path')
    expect(s.trackId).toBe('curated:junior-backend')
    expect(s.selectedId).toBeNull()
  })

  it('does not push back after a popstate (no feedback loop)', () => {
    renderHook(() => useUrlSync())
    setHash('#/list/dsa-bigo')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/list/dsa-bigo')
  })

  it('does not push back after a popstate onto a non-canonical hash (#/quiz)', () => {
    renderHook(() => useUrlSync())
    setHash('#/quiz')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/quiz/flash')
  })

  it('does not push back after a popstate onto a non-canonical hash (#, empty)', () => {
    renderHook(() => useUrlSync())
    setHash('#')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/home')
  })

  it('does not push back after a popstate onto an unknown track id (#/path/domain:ghost)', () => {
    renderHook(() => useUrlSync())
    setHash('#/path/domain:ghost')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/path')
  })

  it('canonicalises on hashchange too (address-bar edits, supabase hash clear)', () => {
    renderHook(() => useUrlSync())
    setHash('#/quiz')
    const before = window.history.length
    window.dispatchEvent(new Event('hashchange'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/quiz/flash')
    expect(useGraphStore.getState().viewMode).toBe('quiz')
  })

  it('survives a double mount without duplicating entries', () => {
    setHash('#/list/dsa-bigo')
    const before = window.history.length
    const a = renderHook(() => useUrlSync())
    a.unmount()
    renderHook(() => useUrlSync())
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/list/dsa-bigo')
  })

  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => useUrlSync())
    unmount()
    const before = window.history.length
    useGraphStore.getState().setViewMode('guide')
    expect(window.history.length).toBe(before)
  })
})
