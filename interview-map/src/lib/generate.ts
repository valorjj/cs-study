import { supabase } from './supabase'

export type GenerateOutcome =
  | { ok: true; skip: false; question: string; reference: string; grounded: boolean }
  | { ok: true; skip: true }
  | { ok: false; reason: 'unauthenticated' | 'rate_limited' | 'gen_error' | 'network' }

export async function generateQuestion(
  nodeId: string, noteText: string, rung: number, noteHash: string,
): Promise<GenerateOutcome> {
  if (!supabase) return { ok: false, reason: 'unauthenticated' }
  try {
    const { data, error } = await supabase.functions.invoke('generate', {
      body: { nodeId, rung, noteText, noteHash },
    })
    if (error) {
      const status = (error as { context?: Response }).context?.status
      if (status === 401) return { ok: false, reason: 'unauthenticated' }
      if (status === 429) return { ok: false, reason: 'rate_limited' }
      return { ok: false, reason: 'gen_error' }
    }
    const r = data as { skip?: unknown; question?: unknown; reference?: unknown; grounded?: unknown } | null
    if (r && r.skip === true) return { ok: true, skip: true }
    const q = r && typeof r.question === 'string' ? r.question : ''
    const ref = r && typeof r.reference === 'string' ? r.reference : ''
    if (!q || !ref) return { ok: false, reason: 'gen_error' }
    return { ok: true, skip: false, question: q, reference: ref, grounded: r!.grounded === false ? false : true }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
