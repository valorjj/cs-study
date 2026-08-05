import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildExtractMessages, parseExtracted } from '../_shared/extract-prompt.ts'
import { chatComplete } from '../_shared/llm.ts'
import { asObjectBody } from '../_shared/jsonBody.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const CAP = Number(Deno.env.get('DAILY_GRADE_CAP') ?? '30')
const MAX_NARRATIVE = 8000   // 프롬프트 폭주 방지
const MAX_CATALOG = 300
const MAX_LIST_ITEMS = 40        // 칩·단계 개수 상한
const MAX_LIST_ITEM_LEN = 60     // 항목 하나의 길이 상한
const MAX_KEYWORDS_PER_ROW = 20   // 카탈로그 행 당 키워드 개수 상한. 300행 × 20키워드 × 80자/필드 = 약 528KB.
                                  // 최악 케이스를 제한해 프롬프트 크기와 비용을 통제한다.

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

  let body: Record<string, unknown>
  try {
    const parsed = asObjectBody(await req.json())
    if (!parsed) return json({ error: 'bad body' }, 400)
    body = parsed
  } catch { return json({ error: 'bad body' }, 400) }

  const narrative = typeof body.maskedNarrative === 'string' ? body.maskedNarrative : ''
  if (!narrative || narrative.length > MAX_NARRATIVE) return json({ error: 'bad body' }, 400)

  const asStrings = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
          .slice(0, MAX_LIST_ITEMS)
          .map((s) => s.slice(0, MAX_LIST_ITEM_LEN))
      : []
  const stack = asStrings(body.stack)
  const lifecycle = asStrings(body.lifecycle)

  const rawCatalog = Array.isArray(body.catalog) ? body.catalog : []
  if (rawCatalog.length === 0 || rawCatalog.length > MAX_CATALOG) return json({ error: 'bad body' }, 400)
  const catalog = rawCatalog
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && !Array.isArray(c))
    .map((c) => c as { id?: unknown; label?: unknown; keywords?: unknown })
    .filter((c) => typeof c.id === 'string' && typeof c.label === 'string')
    .map((c) => {
      const keywords = asStrings(c.keywords).slice(0, MAX_KEYWORDS_PER_ROW)
      return { id: c.id as string, label: c.label as string, keywords }
    })
  if (catalog.length === 0) return json({ error: 'bad body' }, 400)

  // 프로젝트 서술문은 사용자별 비밀이다. question_cache는 전체 공유 캐시이므로
  // 여기서는 읽지도 쓰지도 않는다. 매 호출이 상한을 소비한다.
  const { data: reserved, error: reserveErr } = await supabase.rpc('reserve_grade_slot', { p_cap: CAP })
  if (reserveErr) return json({ error: 'reserve', detail: reserveErr.message }, 500)
  if (reserved !== true) return json({ error: 'rate_limited' }, 429)

  let parsed
  try {
    const raw = await chatComplete(buildExtractMessages({
      maskedNarrative: narrative, stack, lifecycle, catalog,
    }))
    parsed = parseExtracted(raw)
  } catch (e) {
    await supabase.rpc('refund_grade_slot')
    return json({ error: 'llm', detail: String(e) }, 502)
  }
  if (!parsed) { await supabase.rpc('refund_grade_slot'); return json({ error: 'parse' }, 502) }

  await supabase.rpc('log_grade_event', { p_kind: 'extract' })
  return json(parsed, 200)
})
