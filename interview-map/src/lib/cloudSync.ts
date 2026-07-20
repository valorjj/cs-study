import { supabase } from './supabase'
import type { QuizStat } from '../store/graphStore'

// Pure union of local (guest) and cloud studied ids — no duplicates, no mutation.
export function mergeStudied(local: string[], cloud: string[]): string[] {
  return Array.from(new Set([...cloud, ...local]))
}

// Per-domain field-wise max merge of quiz stats. Unlike a sum this is
// idempotent (re-login can't inflate counts), keeps the richer record across
// devices, and never yields correct > seen: each source has correct <= seen,
// so max(correct) is bounded by that source's seen <= max(seen).
export function mergeQuizStats(
  local: Record<string, QuizStat>,
  cloud: Record<string, QuizStat>,
): Record<string, QuizStat> {
  const out: Record<string, QuizStat> = {}
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const l = local[key] ?? { correct: 0, seen: 0 }
    const c = cloud[key] ?? { correct: 0, seen: 0 }
    out[key] = { correct: Math.max(l.correct, c.correct), seen: Math.max(l.seen, c.seen) }
  }
  return out
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
