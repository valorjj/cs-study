import type { ReactNode } from 'react'
import { NavRail } from './NavRail'
import { AuthButton } from './AuthButton'
import { ThemeSwitcher } from './ThemeSwitcher'
import './AppShell.css'

// The app's one layout frame.
//
// Before this existed, SearchBar / AuthButton / ThemeSwitcher / ViewToggle were
// four independent `position: fixed` widgets floating over a 100vw×100vh canvas,
// and every view guessed the top bar's height with `padding-top: 60px`. Nothing
// reserved space for anything, so graph nodes slid under the 로그인 pill (and
// became unclickable) and the bottom nav sat on top of the note's last line.
//
// Here the chrome is real layout: a full-height nav rail and a top bar are grid
// tracks, and the view gets the remaining cell. Content and chrome cannot
// overlap because they occupy different grid areas — the bug is unreachable
// rather than patched.
export function AppShell({ lead, children }: { lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="shell">
      <NavRail />
      <header className="shell-top">
        <div className="shell-lead">{lead}</div>
        <div className="shell-trail">
          <AuthButton />
          <ThemeSwitcher />
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  )
}
