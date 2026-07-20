import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Returns a client only when both credentials exist; otherwise null so the
// whole app degrades to guest-only (localStorage) mode and never crashes.
export function createSupabase(url?: string, anon?: string): SupabaseClient | null {
  if (!url || !anon) return null
  return createClient(url, anon)
}

export const supabase = createSupabase(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
)
