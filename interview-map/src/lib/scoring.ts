import { supabase } from './supabase'

export type RouteAction = 'DRILL_DOWN' | 'PASS' | 'EASIER'

export interface ScoreResult {
  score: number
  missing_keywords: string[]
  feedback: string
}

export interface GradeRequest {
  question: string
  reference: string
  userAnswer: string
  nodeId: string
}

export type GradeOutcome =
  | { ok: true; result: ScoreResult; action: RouteAction }
  | { ok: false; reason: 'unauthenticated' | 'rate_limited' | 'llm_error' | 'network' }

// LLM은 score만 낸다. 라우팅은 이 코드가 결정한다 (스파이크에서 확정한 원칙).
export function routeFromScore(score: number): RouteAction {
  if (score >= 4) return 'DRILL_DOWN'
  if (score <= 2) return 'EASIER'
  return 'PASS'
}

function isValidScore(s: unknown): s is number {
  return typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 5
}

// Edge Function을 호출한다. supabase.functions.invoke가 JWT를 자동 첨부하므로
// 로그인 세션이 있으면 서버가 auth.uid()로 사용자를 안다.
export async function gradeAnswer(req: GradeRequest): Promise<GradeOutcome> {
  if (!supabase) return { ok: false, reason: 'unauthenticated' }
  try {
    const { data, error } = await supabase.functions.invoke('grade', { body: req })
    if (error) {
      const status = (error as { context?: Response }).context?.status
      if (status === 401) return { ok: false, reason: 'unauthenticated' }
      if (status === 429) return { ok: false, reason: 'rate_limited' }
      return { ok: false, reason: 'llm_error' }
    }
    const r = data as Partial<ScoreResult> | null
    if (!r || !isValidScore(r.score)) return { ok: false, reason: 'llm_error' }
    const result: ScoreResult = {
      score: r.score,
      missing_keywords: Array.isArray(r.missing_keywords) ? r.missing_keywords : [],
      feedback: typeof r.feedback === 'string' ? r.feedback : '',
    }
    return { ok: true, result, action: routeFromScore(result.score) }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
