import { describe, it, expect, vi, beforeEach } from 'vitest'

// supabase 모듈을 mock — invoke 결과를 케이스별로 갈아끼운다.
const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

import { routeFromScore, gradeAnswer } from './scoring'

describe('routeFromScore', () => {
  it('score >= 4 → DRILL_DOWN', () => {
    expect(routeFromScore(4)).toBe('DRILL_DOWN')
    expect(routeFromScore(5)).toBe('DRILL_DOWN')
  })
  it('score == 3 → PASS', () => {
    expect(routeFromScore(3)).toBe('PASS')
  })
  it('score <= 2 → EASIER', () => {
    expect(routeFromScore(2)).toBe('EASIER')
    expect(routeFromScore(1)).toBe('EASIER')
  })
})

// supabase-js FunctionsHttpError 흉내: error.context = Response(status)
function httpErr(status: number) {
  return { name: 'FunctionsHttpError', context: new Response(null, { status }) }
}
const REQ = { question: 'q', reference: 'r', userAnswer: 'a', nodeId: 'n' }

describe('gradeAnswer', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockClear()
  })

  it('성공 → ok + action', async () => {
    invoke.mockResolvedValue({ data: { score: 4, missing_keywords: [], feedback: 'ok' }, error: null })
    const out = await gradeAnswer(REQ)
    expect(out).toEqual({ ok: true, result: { score: 4, missing_keywords: [], feedback: 'ok' }, action: 'DRILL_DOWN' })
  })
  it('401 → unauthenticated', async () => {
    invoke.mockResolvedValue({ data: null, error: httpErr(401) })
    expect(await gradeAnswer(REQ)).toEqual({ ok: false, reason: 'unauthenticated' })
  })
  it('429 → rate_limited', async () => {
    invoke.mockResolvedValue({ data: null, error: httpErr(429) })
    expect(await gradeAnswer(REQ)).toEqual({ ok: false, reason: 'rate_limited' })
  })
  it('500 → llm_error', async () => {
    invoke.mockResolvedValue({ data: null, error: httpErr(500) })
    expect(await gradeAnswer(REQ)).toEqual({ ok: false, reason: 'llm_error' })
  })
  it('score 범위 밖 → llm_error', async () => {
    invoke.mockResolvedValue({ data: { score: 9, missing_keywords: [], feedback: '' }, error: null })
    expect(await gradeAnswer(REQ)).toEqual({ ok: false, reason: 'llm_error' })
  })
  it('throw → network', async () => {
    invoke.mockRejectedValue(new Error('down'))
    const result = await gradeAnswer(REQ)
    expect(result).toEqual({ ok: false, reason: 'network' })
  })
})
