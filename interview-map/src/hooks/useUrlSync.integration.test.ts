import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUrlSync } from './useUrlSync'
import { useViewModeEffect, VIEW_KEY } from './useTheme'
import { useGraphStore } from '../store/graphStore'

function setHash(h: string) {
  window.history.replaceState(null, '', h)
}

// Regression test for findings-r1 Critical 1: within one component, effects run
// in hook-call order. useUrlSync must run before useViewModeEffect, or the
// latter's write effect persists the store's pre-hydration default ('home')
// before useUrlSync ever reads the saved tab back out of localStorage — silently
// breaking "resume the last-visited tab on a bare visit". A test that mounts
// useUrlSync in isolation (as useUrlSync.test.ts does) can't see this bug,
// because nothing else writes to VIEW_KEY.
describe('useUrlSync + useViewModeEffect mounted together (App.tsx order)', () => {
  beforeEach(() => {
    localStorage.clear()
    setHash('#/home')
    useGraphStore.setState({ viewMode: 'home', selectedId: null, trackId: null, quizMode: 'flash' })
  })

  it('restores the saved tab on a bare visit when mounted in App.tsx order', () => {
    localStorage.setItem(VIEW_KEY, 'guide')
    setHash('#')

    renderHook(() => {
      // Mirrors the call order in App.tsx: useUrlSync before useViewModeEffect.
      useUrlSync()
      useViewModeEffect()
    })

    expect(useGraphStore.getState().viewMode).toBe('guide')
    expect(window.location.hash).toBe('#/guide')
  })
})
