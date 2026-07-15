import { useEffect, useRef, useState } from 'react'
import { LuPalette, LuCheck } from 'react-icons/lu'
import { THEMES, tokensOf } from '../styles/themes'
import { useGraphStore } from '../store/graphStore'
import './ThemeSwitcher.css'

// Compact icon button that opens a theme picker popover — keeps the top bar
// uncluttered (especially on mobile) vs. an always-visible dropdown.
export function ThemeSwitcher() {
  const themeId = useGraphStore((s) => s.themeId)
  const setTheme = useGraphStore((s) => s.setTheme)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="ts" ref={ref}>
      <button className="ts-btn" aria-label="테마 변경" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <LuPalette size={18} />
      </button>
      {open && (
        <ul className="ts-menu" role="listbox">
          {THEMES.map((t) => {
            const tk = tokensOf(t.id)
            const active = t.id === themeId
            return (
              <li key={t.id}>
                <button role="option" aria-selected={active} data-active={active}
                  onClick={() => { setTheme(t.id); setOpen(false) }}>
                  <span className="ts-swatch" style={{ background: tk.accent, borderColor: tk.border }} />
                  <span className="ts-name">{t.label}</span>
                  {active && <LuCheck size={15} className="ts-check" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
