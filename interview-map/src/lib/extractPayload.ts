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
// JSON.stringify는 백슬래시·따옴표·제어문자를 이스케이프하므로, 직렬화된 텍스트에서
// 원문 그대로를 찾으면 그런 문자가 든 키는 payload에 남아 있어도 발견되지 않는다.
// 그래서 원문과 이스케이프된 형태를 함께 본다. 필드를 하나하나 훑지 않는 이유는,
// 나중에 payload에 필드가 추가되면 열거 목록이 조용히 낡기 때문이다.
export function assertNoPlaintext(payload: ExtractPayload, dict: Record<string, string>): void {
  const json = JSON.stringify(payload)
  for (const plain of Object.keys(dict)) {
    if (!plain) continue   // 빈 키는 모든 문자열에 걸리므로 검사 대상이 아니다
    const escaped = JSON.stringify(plain).slice(1, -1)   // 양쪽 따옴표 제거
    if (json.includes(plain) || json.includes(escaped)) {
      throw new Error(`payload에 마스킹되지 않은 원문이 남아 있어 전송을 중단했습니다: ${plain}`)
    }
  }
}
