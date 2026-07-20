import { useState } from 'react'
import { LuLogIn, LuLogOut, LuGithub } from 'react-icons/lu'
import { useAuth } from '../hooks/useAuth'
import './AuthButton.css'

// Top-right auth control. Hidden entirely when Supabase is unconfigured
// (guest-only build). Guest → 로그인 popover (GitHub/Google); signed in → identity + 로그아웃.
export function AuthButton() {
  const { user, enabled, signIn, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  if (!enabled) return null

  if (user) {
    const meta = user.user_metadata as { user_name?: string; name?: string; avatar_url?: string }
    const label = meta.user_name || meta.name || user.email || '사용자'
    return (
      <div className="auth">
        <button className="auth-user" onClick={() => setOpen((o) => !o)} title={label}>
          {meta.avatar_url
            ? <img className="auth-avatar" src={meta.avatar_url} alt="" />
            : <span className="auth-avatar auth-avatar-fallback">{label[0]?.toUpperCase()}</span>}
          <span className="auth-name">{label}</span>
        </button>
        {open && (
          <div className="auth-pop">
            <button className="auth-opt" onClick={() => { signOut(); setOpen(false) }}>
              <LuLogOut size={15} /> 로그아웃
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="auth">
      <button className="auth-login" onClick={() => setOpen((o) => !o)}>
        <LuLogIn size={15} /> 로그인
      </button>
      {open && (
        <div className="auth-pop">
          <button className="auth-opt" onClick={() => signIn('github')}><LuGithub size={15} /> GitHub로 계속</button>
          <button className="auth-opt" onClick={() => signIn('google')}><span className="auth-g">G</span> Google로 계속</button>
        </div>
      )}
    </div>
  )
}
