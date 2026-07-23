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

  // 3. 일일 상한: LLM "전에" 슬롯을 원자적으로 예약(check+increment 한 문장 → TOCTOU 없음).
  //    "오늘"은 전적으로 SQL의 current_date로 판단(JS 쪽 날짜 계산 없음 → TZ 결합 없음).
  const { data: reserved, error: reserveErr } = await supabase.rpc('reserve_grade_slot', { p_cap: CAP })
  // rpc 에러를 삼키지 않는다: 스키마 미적용/함수 부재면 500으로 명확히 실패(상한 조용히 무력화 방지).
  if (reserveErr) return json({ error: 'reserve', detail: reserveErr.message }, 500)
  if (reserved !== true) return json({ error: 'rate_limited' }, 429)

  // 4. 채점(인젝션 방어 프롬프트 + LLM + 파싱). 실패하면 예약한 슬롯을 환불("실패는 무료").
  let parsed
  try {
    const raw = await chatComplete(buildMessages({ question, reference, userAnswer: userAnswer || '(무응답)' }))
    parsed = parseScoreResponse(raw)
  } catch (e) {
    await supabase.rpc('refund_grade_slot')
    return json({ error: 'llm', detail: String(e) }, 502)
  }
  if (!parsed) {
    await supabase.rpc('refund_grade_slot')
    return json({ error: 'parse' }, 502)
  }

  // 5. 성공 → 슬롯은 이미 소비됨(3에서 예약). 결과 반환.
  return json(parsed, 200)
})
