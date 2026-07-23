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

  // 5. 성공 시에만 카운트 증가(원자적)
  await supabase.rpc('increment_grade_usage')

  return json(parsed, 200)
})
