import { supabase } from './supabase'
import type { QuizStat } from '../store/graphStore'

// Guest and logged-in progress are kept fully separate (see useCloudSync), so
// there is no cross-source merge — login replaces state with the cloud row.

// Returns the user's studied ids, or null when there is no row yet or Supabase
// is unconfigured/unreachable.
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

// Returns the user's quiz stats, or null when there is no row yet (→ migrate
// local up) or Supabase is unconfigured/unreachable.
export async function loadQuizStats(userId: string): Promise<Record<string, QuizStat> | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_state')
    .select('quiz_stats')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return (data.quiz_stats as Record<string, QuizStat> | null) ?? {}
}

// Upsert only quiz_stats (+ updated_at); studied_ids is left untouched.
export async function saveQuizStats(userId: string, quizStats: Record<string, QuizStat>): Promise<void> {
  if (!supabase) return
  await supabase
    .from('user_state')
    .upsert({ user_id: userId, quiz_stats: quizStats, updated_at: new Date().toISOString() })
}
