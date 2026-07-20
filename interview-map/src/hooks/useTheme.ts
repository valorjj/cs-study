import { useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import { applyTheme, DEFAULT_THEME } from '../styles/themes'

const KEY = 'interview-map.theme.v1'
const VIEW_KEY = 'interview-map.viewMode.v1'

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

// Persist the graph/list view mode across sessions (mirrors theme persistence).
export function useViewModeEffect(): void {
  const viewMode = useGraphStore((s) => s.viewMode)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === 'graph' || saved === 'list' || saved === 'quiz' || saved === 'path') setViewMode(saved)
    // hydrate once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode) } catch { /* ignore */ }
  }, [viewMode])
}

// NOTE: studiedIds and quizStats persistence is owned by useCloudSync, which
// routes writes to localStorage (guest) or the cloud (logged in) and keeps the
// two separate. Don't add a plain localStorage persist effect here — it would
// clobber the guest copy with account data while logged in.
