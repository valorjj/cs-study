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
