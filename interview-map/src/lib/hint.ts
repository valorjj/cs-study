import { supabase } from './supabase'

export type HintOutcome =
  | { ok: true; hint: string }
  | { ok: false; reason: 'unauthenticated' | 'rate_limited' | 'hint_error' | 'network' }

export async function getHint(question: string, reference: string, userAnswer: string): Promise<HintOutcome> {
  if (!supabase) return { ok: false, reason: 'unauthenticated' }
  try {
    const { data, error } = await supabase.functions.invoke('hint', { body: { question, reference, userAnswer } })
    if (error) {
      const status = (error as { context?: Response }).context?.status
      if (status === 401) return { ok: false, reason: 'unauthenticated' }
      if (status === 429) return { ok: false, reason: 'rate_limited' }
      return { ok: false, reason: 'hint_error' }
    }
    const r = data as { hint?: unknown } | null
    const h = r && typeof r.hint === 'string' ? r.hint : ''
    if (!h) return { ok: false, reason: 'hint_error' }
    return { ok: true, hint: h }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
