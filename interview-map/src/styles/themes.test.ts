import { describe, it, expect, beforeEach, vi } from 'vitest'
import { THEME_KEY, readSavedTheme, DEFAULT_THEME, THEMES } from './themes'

describe('readSavedTheme', () => {
  beforeEach(() => localStorage.clear())

  it('returns the default when nothing is saved', () => {
    expect(readSavedTheme()).toBe(DEFAULT_THEME)
  })

  it('returns a saved theme id', () => {
    localStorage.setItem(THEME_KEY, 'terminal')
    expect(readSavedTheme()).toBe('terminal')
  })

  it('ignores a value that is not a known theme', () => {
    // A stale id from a removed theme, or a hand-edited value, must not leave
    // the app with no palette applied.
    localStorage.setItem(THEME_KEY, 'solarized-that-never-shipped')
    expect(readSavedTheme()).toBe(DEFAULT_THEME)
  })

  it('accepts every shipped theme', () => {
    for (const t of THEMES) {
      localStorage.setItem(THEME_KEY, t.id)
      expect(readSavedTheme()).toBe(t.id)
    }
  })
})

describe('store hydration (theme persistence regression)', () => {
  beforeEach(() => {
    localStorage.clear()
    // The store reads localStorage at module-evaluation time, so each case
    // needs a fresh module registry.
    vi.resetModules()
  })

  it('starts from the saved theme rather than the default', async () => {
    localStorage.setItem(THEME_KEY, 'dracula')
    const { useGraphStore } = await import('../store/graphStore')
    // The first render must already see 'dracula'. When this was hydrated in an
    // effect instead, the persist effect ran in the same commit still holding
    // the pre-hydration default, wrote it back over the saved value, and
    // StrictMode's second pass then read the clobbered value — so the theme was
    // lost on every reload.
    expect(useGraphStore.getState().themeId).toBe('dracula')
  })

  it('falls back to the default with nothing saved', async () => {
    const { useGraphStore } = await import('../store/graphStore')
    expect(useGraphStore.getState().themeId).toBe(DEFAULT_THEME)
  })
})
