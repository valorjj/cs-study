import { supabase } from './supabase'

export type GenerateOutcome =
  | { ok: true; question: string; reference: string }
  | { ok: false; reason: 'unauthenticated' | 'rate_limited' | 'gen_error' | 'network' }

export async function generateQuestion(nodeId: string, noteText: string): Promise<GenerateOutcome> {
  if (!supabase) return { ok: false, reason: 'unauthenticated' }
  try {
    const { data, error } = await supabase.functions.invoke('generate', { body: { nodeId, noteText } })
    if (error) {
      const status = (error as { context?: Response }).context?.status
      if (status === 401) return { ok: false, reason: 'unauthenticated' }
      if (status === 429) return { ok: false, reason: 'rate_limited' }
      return { ok: false, reason: 'gen_error' }
    }
    const r = data as { question?: unknown; reference?: unknown } | null
    const q = r && typeof r.question === 'string' ? r.question : ''
    const ref = r && typeof r.reference === 'string' ? r.reference : ''
    if (!q || !ref) return { ok: false, reason: 'gen_error' }
    return { ok: true, question: q, reference: ref }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
