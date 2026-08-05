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

// 미리보기 전용. 전송되는 값을 UI가 그대로 보여줄 수 있도록 같은 빌더를 돈다.
// buildExtractPayload는 순수 함수이므로 같은 입력이면 requestExtract가 만드는 것과
// 같은 값이 나온다 — 미리보기와 전송이 구조적으로 갈라지지 않는다.
export function prepareExtract(project: Project, nodes: GraphNode[]): ExtractPayload {
  return buildExtractPayload(project, nodes)
}

// payload를 인자로 받지 않고 직접 만든다. 받도록 두면 호출자가 검사를 통과한 값을
// 스프레드로 덮어써서(`{ ...prepareExtract(...), maskedNarrative: 유출 }`) 검사되지
// 않은 내용을 전송할 수 있고, 실제로 이전 구조가 그랬다. 전송 직전에 평문 검사가
// 돌았다는 것을 이 함수 안에서 보장한다 — buildExtractPayload가 검사를 품고 있다.
export async function requestExtract(project: Project, nodes: GraphNode[]): Promise<ExtractOutcome> {
  if (!supabase) return { ok: false, reason: 'unauthenticated' }
  // 검사 실패는 throw로 나간다 (위 주석 참조). try 밖에 두어야 network로 오분류되지 않는다.
  const payload = buildExtractPayload(project, nodes)
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
