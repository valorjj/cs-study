import { supabase } from './supabase'

// Pure union of local (guest) and cloud studied ids — no duplicates, no mutation.
export function mergeStudied(local: string[], cloud: string[]): string[] {
  return Array.from(new Set([...cloud, ...local]))
}

// Returns the user's studied ids, or null when there is no row yet (→ migrate
// local up) or Supabase is unconfigured/unreachable.
export async function loadStudied(userId: string): Promise<string[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_state')
    .select('studied_ids')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return (data.studied_ids as string[] | null) ?? []
}

// Upsert only studied_ids (+ updated_at); quiz_stats is left untouched.
export async function saveStudied(userId: string, studiedIds: string[]): Promise<void> {
  if (!supabase) return
  await supabase
    .from('user_state')
    .upsert({ user_id: userId, studied_ids: studiedIds, updated_at: new Date().toISOString() })
}
