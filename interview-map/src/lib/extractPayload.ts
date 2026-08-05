// 네트워크로 나가는 payload를 만드는 단 하나의 경로. 미리보기 UI도 반드시 이 함수의
// 결과를 렌더해야 한다 — 미리보기와 전송이 갈라지면 미리보기는 거짓 안전감만 주는
// 장식이 된다.
import { applyMask } from './mask'
import type { Project, Stage } from './resumeTypes'
import type { GraphNode } from '../graph/types'

export interface CatalogEntry {
  id: string
  label: string
  keywords: string[]
}

export interface ExtractPayload {
  maskedNarrative: string
  stack: string[]          // 기술 용어이므로 마스킹하지 않는다 (추출의 핵심 신호)
  lifecycle: Stage[]
  catalog: CatalogEntry[]  // 공개 데이터. graph.json을 Edge Function에 복제하지 않기 위해 보낸다
}

// 프로젝트명·기간·역할은 추출에 필요 없으므로 애초에 담지 않는다 (최소 전송).
export function buildExtractPayload(project: Project, nodes: GraphNode[]): ExtractPayload {
  return {
    maskedNarrative: applyMask(project.narrative, project.maskDict),
    stack: project.stack,
    lifecycle: project.lifecycle,
    catalog: nodes
      .filter((n) => n.level !== 0)
      .map((n) => ({ id: n.id, label: n.label, keywords: n.keywords })),
  }
}

// 방어의 마지막 층. 조용한 유출을 시끄러운 예외로 바꾼다.
// 호출자는 이 예외를 사용자에게 "전송을 중단했습니다"로 보여줘야 한다.
export function assertNoPlaintext(payload: ExtractPayload, dict: Record<string, string>): void {
  const json = JSON.stringify(payload)
  for (const plain of Object.keys(dict)) {
    if (plain && json.includes(plain)) {
      throw new Error(`payload에 마스킹되지 않은 원문이 남아 있어 전송을 중단했습니다: ${plain}`)
    }
  }
}
