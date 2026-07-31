import { useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import { applyTheme, DEFAULT_THEME } from '../styles/themes'

const KEY = 'interview-map.theme.v1'
export const VIEW_KEY = 'interview-map.viewMode.v1'

export function useThemeEffect(): void {
  const themeId = useGraphStore((s) => s.themeId)
  const setTheme = useGraphStore((s) => s.setTheme)
  useEffect(() => {
    const saved = localStorage.getItem(KEY)
    if (saved) setTheme(saved)
    else applyTheme(DEFAULT_THEME)
    // hydrate once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    applyTheme(themeId)
    try { localStorage.setItem(KEY, themeId) } catch { /* ignore */ }
  }, [themeId])
}

// Persist the last-visited tab so a bare visit (no hash) resumes there.
// Hydration now belongs to useUrlSync — the URL outranks localStorage.
export function useViewModeEffect(): void {
  const viewMode = useGraphStore((s) => s.viewMode)
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode) } catch { /* ignore */ }
  }, [viewMode])
}

// NOTE: studiedIds and quizStats persistence is owned by useCloudSync, which
// routes writes to localStorage (guest) or the cloud (logged in) and keeps the
// two separate. Don't add a plain localStorage persist effect here — it would
// clobber the guest copy with account data while logged in.
