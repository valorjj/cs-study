import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildMessages, parseScoreResponse } from '../_shared/prompt.ts'
import { chatComplete } from '../_shared/llm.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const CAP = Number(Deno.env.get('DAILY_GRADE_CAP') ?? '30')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  // 유저 JWT를 그대로 넘겨 auth.uid()가 RLS/RPC에서 동작하게 한다.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  // 1. 로그인 검증
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  // 2. 바디 검증
  let body: { question?: string; reference?: string; userAnswer?: string }
  try { body = await req.json() } catch { return json({ error: 'bad body' }, 400) }
  const { question, reference, userAnswer } = body
  if (!question || !reference || typeof userAnswer !== 'string') return json({ error: 'bad body' }, 400)

  // 3. 일일 상한 사전 체크(본인 행 읽기 — RLS 통과)
  // FIXME(배포 전 fast-follow): 이 check(3)와 아래 increment(5)는 원자적이지 않다(TOCTOU).
  //   같은 유저의 동시 요청이 둘 다 count=CAP-1을 읽고 통과 → 상한을 동시성만큼 초과할 수 있다.
  //   해결: increment_grade_usage()에 상한 판단을 접어(new count 반환/거부) LLM 호출 "전에" 원자적으로 소비.
  //   단 그 방식은 spec §4 "실패는 무료(성공 시에만 증가)"와 충돌하므로, 실제 원자화 시 reserve+실패시 refund
  //   패턴으로 둘 다 만족시킬지 결정할 것. 유저당 상한이고 미배포라 지금은 보류(실제 노출 작음). 상세: docs/superpowers/plans/2026-07-23-ai-answer-scoring.md.
  // NOTE(TZ 결합): 여기 "오늘"은 JS UTC(toISOString) 기준, SQL의 current_date는 DB 세션 TZ 기준.
  //   Supabase Postgres 기본이 UTC라 지금은 일치. DB TZ를 바꾸면 check가 읽는 행과 increment가 쓰는 행이 갈릴 수 있음.
  const { data: usage } = await supabase
    .from('grade_usage').select('count').eq('user_id', user.id).eq('day', new Date().toISOString().slice(0, 10)).maybeSingle()
  if ((usage?.count ?? 0) >= CAP) return json({ error: 'rate_limited' }, 429)

  // 4. 채점(인젝션 방어 프롬프트 + LLM + 파싱)
  let parsed
  try {
    const raw = await chatComplete(buildMessages({ question, reference, userAnswer: userAnswer || '(무응답)' }))
    parsed = parseScoreResponse(raw)
  } catch (e) {
    return json({ error: 'llm', detail: String(e) }, 502)
  }
  if (!parsed) return json({ error: 'parse' }, 502)

  // 5. 성공 시에만 카운트 증가. increment_grade_usage() 자체의 upsert는 원자적이지만,
  //    위 check(3)와의 관계는 원자적이지 않다(3의 FIXME 참고).
  // NOTE(배포 전): 이 rpc 에러를 무시하고 있다. 스키마 미적용/rpc 실패 시에도 200을 반환해
  //    상한이 조용히 무력화된다. fast-follow 때 { error } 확인·로깅(또는 fail-closed) 추가할 것.
  await supabase.rpc('increment_grade_usage')

  return json(parsed, 200)
})
