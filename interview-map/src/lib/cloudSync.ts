import { supabase } from './supabase'
import type { QuizStat } from '../store/graphStore'
import type { SrsState } from './srs'

// Guest and logged-in progress are kept fully separate (see useCloudSync), so
// there is no cross-source merge — login replaces state with the cloud row.

// Supabase errors were previously swallowed, which hid setup problems (e.g. a
// missing `user_state` table → progress silently never persists). Surface them.
function logError(op: string, error: unknown): void {
  if (!error) return
  // eslint-disable-next-line no-console
  console.error(`[cloudSync] ${op} failed:`, error)
}

// Returns the user's studied ids, or null when there is no row yet or Supabase
// is unconfigured/unreachable.
export async function loadStudied(userId: string): Promise<string[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_state')
    .select('studied_ids')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { logError('loadStudied', error); return null }
  if (!data) return null
  return (data.studied_ids as string[] | null) ?? []
}

// Upsert only studied_ids (+ updated_at); quiz_stats is left untouched.
export async function saveStudied(userId: string, studiedIds: string[]): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('user_state')
    .upsert({ user_id: userId, studied_ids: studiedIds, updated_at: new Date().toISOString() })
  logError('saveStudied', error)
}

// Returns the user's quiz stats, or null when there is no row yet or Supabase
// is unconfigured/unreachable.
export async function loadQuizStats(userId: string): Promise<Record<string, QuizStat> | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_state')
    .select('quiz_stats')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { logError('loadQuizStats', error); return null }
  if (!data) return null
  return (data.quiz_stats as Record<string, QuizStat> | null) ?? {}
}

// Upsert only quiz_stats (+ updated_at); studied_ids is left untouched.
export async function saveQuizStats(userId: string, quizStats: Record<string, QuizStat>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('user_state')
    .upsert({ user_id: userId, quiz_stats: quizStats, updated_at: new Date().toISOString() })
  logError('saveQuizStats', error)
}

// Returns the user's srs state, or null when there is no row yet or Supabase
// is unconfigured/unreachable.
export async function loadSrs(userId: string): Promise<SrsState | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_state')
    .select('srs')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { logError('loadSrs', error); return null }
  if (!data) return null
  return (data.srs as SrsState | null) ?? {}
}

// Upsert only srs (+ updated_at); other columns are left untouched.
export async function saveSrs(userId: string, srs: SrsState): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('user_state')
    .upsert({ user_id: userId, srs, updated_at: new Date().toISOString() })
  logError('saveSrs', error)
}
