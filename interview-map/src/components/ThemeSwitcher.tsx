import { THEMES } from '../styles/themes'
import { useGraphStore } from '../store/graphStore'
import './ThemeSwitcher.css'

export function ThemeSwitcher() {
  const themeId = useGraphStore((s) => s.themeId)
  const setTheme = useGraphStore((s) => s.setTheme)
  return (
    <div className="ts">
      <label className="ts-label" htmlFor="theme">Theme</label>
      <select id="theme" className="ts-select" value={themeId} onChange={(e) => setTheme(e.target.value)}>
        {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </div>
  )
}
