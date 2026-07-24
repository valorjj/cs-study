import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildGenerateMessages, parseGenerated } from '../_shared/generate-prompt.ts'
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
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  let body: { nodeId?: string; rung?: number; noteText?: string; noteHash?: string }
  try { body = await req.json() } catch { return json({ error: 'bad body' }, 400) }
  const { nodeId, rung, noteText, noteHash } = body
  if (!nodeId || typeof nodeId !== 'string' ||
      typeof rung !== 'number' || !noteText || typeof noteText !== 'string' ||
      !noteHash || typeof noteHash !== 'string') {
    return json({ error: 'bad body' }, 400)
  }

  // 1) 캐시 조회(전체 공유). 히트면 상한·LLM 없이 즉시 반환.
  const { data: cached } = await supabase
    .from('question_cache')
    .select('question, reference, grounded')
    .eq('node_id', nodeId).eq('rung', rung).eq('note_hash', noteHash)
    .maybeSingle()
  if (cached) {
    if (!cached.question) return json({ skip: true }, 200) // question='' → 스킵 캐시
    return json({ question: cached.question, reference: cached.reference, grounded: cached.grounded }, 200)
  }

  // 2) 미스 → 상한 예약(실패 시 refund)
  const { data: reserved, error: reserveErr } = await supabase.rpc('reserve_grade_slot', { p_cap: CAP })
  if (reserveErr) return json({ error: 'reserve', detail: reserveErr.message }, 500)
  if (reserved !== true) return json({ error: 'rate_limited' }, 429)

  let parsed
  try {
    const raw = await chatComplete(buildGenerateMessages(noteText, rung))
    parsed = parseGenerated(raw)
  } catch (e) {
    await supabase.rpc('refund_grade_slot')
    return json({ error: 'llm', detail: String(e) }, 502)
  }
  if (!parsed) { await supabase.rpc('refund_grade_slot'); return json({ error: 'parse' }, 502) }

  await supabase.rpc('log_grade_event', { p_kind: 'generate' })

  // 3) 캐시에 저장(skip은 question='' 로). 실패해도 응답엔 영향 없음.
  if ('skip' in parsed) {
    await supabase.rpc('upsert_question_cache', {
      p_node_id: nodeId, p_rung: rung, p_note_hash: noteHash,
      p_question: '', p_reference: '', p_grounded: true,
    })
    return json({ skip: true }, 200)
  }
  await supabase.rpc('upsert_question_cache', {
    p_node_id: nodeId, p_rung: rung, p_note_hash: noteHash,
    p_question: parsed.question, p_reference: parsed.reference, p_grounded: parsed.grounded,
  })
  return json(parsed, 200)
})
