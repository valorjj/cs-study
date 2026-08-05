// extract Edge Function 클라이언트. generate.ts와 같은 형태의 Outcome 유니온을 쓴다.
import { supabase } from './supabase'
import { buildExtractPayload, type ExtractPayload } from './extractPayload'
import type { Project } from './resumeTypes'
import type { GraphNode } from '../graph/types'

export type ExtractOutcome =
  | { ok: true; nodeIds: string[]; reasons: Record<string, string> }
  | { ok: false; reason: 'unauthenticated' | 'rate_limited' | 'extract_error' | 'network' }

// 평문 잔존은 Outcome이 아니라 예외로 나온다 — buildExtractPayload가 throw하고,
// UI가 잡아서 "전송을 중단했습니다"로 보여준다. 선언만 있고 아무도 만들 수 없는
// 실패 사유를 union에 남겨두지 않는다.

// payload를 만드는 명확한 입구. buildExtractPayload가 plaintext를 검사하므로,
// 이 함수를 거치지 않은 호출도 안전하다.
export function prepareExtract(project: Project, nodes: GraphNode[]): ExtractPayload {
  return buildExtractPayload(project, nodes)
}

export async function requestExtract(payload: ExtractPayload): Promise<ExtractOutcome> {
  if (!supabase) return { ok: false, reason: 'unauthenticated' }
  try {
    const { data, error } = await supabase.functions.invoke('extract', { body: payload })
    if (error) {
      const status = (error as { context?: Response }).context?.status
      if (status === 401) return { ok: false, reason: 'unauthenticated' }
      if (status === 429) return { ok: false, reason: 'rate_limited' }
      return { ok: false, reason: 'extract_error' }
    }
    const r = data as { nodeIds?: unknown; reasons?: unknown } | null
    if (!r || !Array.isArray(r.nodeIds)) return { ok: false, reason: 'extract_error' }
    const nodeIds = r.nodeIds.filter((x): x is string => typeof x === 'string')
    const reasons: Record<string, string> = {}
    if (r.reasons && typeof r.reasons === 'object') {
      for (const [k, v] of Object.entries(r.reasons as Record<string, unknown>)) {
        if (typeof v === 'string') reasons[k] = v
      }
    }
    return { ok: true, nodeIds, reasons }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
