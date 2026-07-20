import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AuthProvider = 'github' | 'google'

// Wraps supabase.auth. All actions no-op when Supabase is unconfigured
// (`supabase === null`), so callers work unchanged in guest-only mode.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(!!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession()
      .then(({ data }) => { setUser(data.session?.user ?? null) })
      .catch(() => { /* offline / unreachable → stay guest */ })
      .finally(() => { setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = (provider: AuthProvider) => {
    supabase?.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }
  const signOut = () => { supabase?.auth.signOut() }

  return { user, loading, enabled: !!supabase, signIn, signOut }
}
