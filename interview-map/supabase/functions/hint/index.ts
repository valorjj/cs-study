import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHintMessages, parseHint } from '../_shared/hint-prompt.ts'
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

  let body: { question?: string; reference?: string; userAnswer?: string }
  try { body = await req.json() } catch { return json({ error: 'bad body' }, 400) }
  const { question, reference, userAnswer } = body
  if (!question || !reference || !userAnswer ||
      typeof question !== 'string' || typeof reference !== 'string' || typeof userAnswer !== 'string') {
    return json({ error: 'bad body' }, 400)
  }

  const { data: reserved, error: reserveErr } = await supabase.rpc('reserve_grade_slot', { p_cap: CAP })
  if (reserveErr) return json({ error: 'reserve', detail: reserveErr.message }, 500)
  if (reserved !== true) return json({ error: 'rate_limited' }, 429)

  let parsed
  try {
    const raw = await chatComplete(buildHintMessages(question, reference, userAnswer))
    parsed = parseHint(raw)
  } catch (e) {
    await supabase.rpc('refund_grade_slot')
    return json({ error: 'llm', detail: String(e) }, 502)
  }
  if (!parsed) { await supabase.rpc('refund_grade_slot'); return json({ error: 'parse' }, 502) }

  await supabase.rpc('log_grade_event', { p_kind: 'hint' })
  return json(parsed, 200)
})
