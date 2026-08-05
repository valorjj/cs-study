// extract Edge Function 클라이언트. generate.ts와 같은 형태의 Outcome 유니온을 쓴다.
import { supabase } from './supabase'
import { buildExtractPayload, type ExtractPayload } from './extractPayload'
import type { Project } from './resumeTypes'
import type { GraphNode } from '../graph/types'

export type ExtractOutcome =
  | { ok: true; nodeIds: string[]; reasons: Record<string, string> }
  | { ok: false; reason: 'unauthenticated' | 'rate_limited' | 'extract_error' | 'network' }

// 평문 잔존은 Outcome이 아니라 예외로 나온다 — buildExtractPayload가 throw하고,
// UI가 잡아서 "전송을 중단했습니다"로 보여준다. union에 넣지 않는 이유는 "아무도
// 만들 수 없어서"가 아니다(검사가 requestExtract 안으로 들어온 뒤로는 만들 수 있다).
// 나머지 사유는 전부 정상 동작 중 일어나는 일인데 평문 잔존은 불변식 위반이라,
// 호출자가 다른 실패와 같은 모양으로 무심히 흘려보내면 안 되기 때문이다.
//
// **그래서 requestExtract는 Promise를 reject할 수 있다. 호출자에게 try/catch가
// 필요하다** — Promise<ExtractOutcome> 이라는 서명만으로는 드러나지 않는 사실이다.

// 미리보기 전용. 전송되는 값을 UI가 그대로 보여줄 수 있도록 같은 빌더를 돈다.
// 같은 입력이면 requestExtract가 만드는 것과 같은 값이 나온다. (빌더는 순수하지
// 않다 — throw하고, 인자의 배열을 참조로 담는다. extractPayload.ts 주석 참조.)
export function prepareExtract(project: Project, nodes: GraphNode[]): ExtractPayload {
  return buildExtractPayload(project, nodes)
}

// payload를 인자로 받지 않고 직접 만든다. 받도록 두면 호출자가 검사를 통과한 값을
// 스프레드로 덮어써서(`{ ...prepareExtract(...), maskedNarrative: 유출 }`) 검사되지
// 않은 내용을 전송할 수 있고, 실제로 이전 구조가 그랬다. 전송 직전에 평문 검사가
// 돌았다는 것을 이 함수 안에서 보장한다 — buildExtractPayload가 검사를 품고 있다.
export async function requestExtract(project: Project, nodes: GraphNode[]): Promise<ExtractOutcome> {
  // 검사가 supabase 유무보다 먼저다. 뒤에 두면 마스킹이 깨진 상태가 "로그인 필요"로
  // 보고되어, 사용자는 로그인만 반복하고 진짜 원인을 영원히 못 본다.
  // try 밖에 두는 이유: 안에 두면 catch가 삼켜서 network로 오분류된다.
  const payload = buildExtractPayload(project, nodes)
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
