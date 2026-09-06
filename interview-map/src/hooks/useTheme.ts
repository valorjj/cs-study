import { useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import { applyTheme, THEME_KEY } from '../styles/themes'

export const VIEW_KEY = 'interview-map.viewMode.v1'

// Apply + persist only. Hydration belongs to the store (readSavedTheme), which
// reads localStorage synchronously at creation — doing it here in an effect
// raced with this persist effect and lost the theme on every reload.
export function useThemeEffect(): void {
  const themeId = useGraphStore((s) => s.themeId)
  useEffect(() => {
    applyTheme(themeId)
    try { localStorage.setItem(THEME_KEY, themeId) } catch { /* ignore */ }
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
