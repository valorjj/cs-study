import { useEffect } from 'react'
import { useGraphStore } from '../store/graphStore'
import { applyTheme, DEFAULT_THEME } from '../styles/themes'

const KEY = 'interview-map.theme.v1'

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
