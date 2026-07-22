import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { LuInfo, LuX } from 'react-icons/lu'
import './InfoPopover.css'

// Small ℹ️ toggle that opens a positioned help card. Closes on outside-click
// or Esc. Multiple instances are independent.
export function InfoPopover({ title, body, align = 'left' }: {
  title: string
  body: ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="infopop" ref={ref}>
      <button className="infopop-btn" aria-label={`${title} 설명`} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <LuInfo size={14} />
      </button>
      {open && (
        <div className="infopop-card" data-align={align} role="dialog" aria-label={title}>
          <div className="infopop-head">
            <span className="infopop-title">{title}</span>
            <button className="infopop-close" aria-label="닫기" onClick={() => setOpen(false)}>
              <LuX size={13} />
            </button>
          </div>
          <div className="infopop-body">{body}</div>
        </div>
      )}
    </div>
  )
}
