// 네트워크로 나가는 payload를 만드는 단 하나의 경로. 미리보기 UI도 이 함수의 결과를
// 그대로 렌더해야 한다 — 미리보기와 전송이 갈라지면 미리보기는 거짓 안전감만 주는
// 장식이 된다.
//
// 평문 잔존 검사는 이 함수 안에서 돈다. 규약(주석)으로만 두면 호출자가 건너뛸 수
// 있고, 실제로 이 주석이 다음 UI 작업에 그 우회를 권하고 있었다. 안전 속성은
// 문장이 아니라 코드가 강제해야 한다.
import { applyMask } from './mask'
import type { Project, Stage } from './resumeTypes'
import type { GraphNode } from '../graph/types'

export interface CatalogEntry {
  id: string
  label: string
  keywords: string[]
}

// 필드는 readonly다 — 검사는 이 객체가 만들어지는 순간 한 번 도니까. 단 얕은
// readonly라서 `catalog[0].keywords.push(...)` 같은 중첩 변형은 타입이 막지 못한다.
// 그게 유출로 이어지지 않는 이유는 readonly가 아니라 구조다: 전송되는 payload는
// requestExtract가 그 자리에서 새로 만들며, 미리보기용 객체를 재사용하지 않는다.
//
// 한때 여기에 unique symbol 브랜드가 있었다. "검사를 거치지 않은 객체는 전송 함수에
// 넘길 수 없다"를 타입으로 강제하려던 것인데, 스프레드가 심볼 키까지 복사하므로
// `{ ...buildExtractPayload(...), maskedNarrative: 유출 }` 이 그대로 통과했다.
// 브랜드를 고치는 대신 이음새를 없앴다 — requestExtract가 payload를 받지 않고
// 직접 만든다(extract.ts 참조). 넘길 수 있는 지점이 없으면 막을 것도 없다.
export interface ExtractPayload {
  readonly maskedNarrative: string
  readonly stack: readonly string[]          // 기술 용어이므로 마스킹하지 않는다 (추출의 핵심 신호)
  readonly lifecycle: readonly Stage[]
  readonly catalog: readonly CatalogEntry[]  // 공개 데이터. graph.json을 Edge Function에 복제하지 않기 위해 보낸다
}

// stack 칩과 마스킹 대상 키가 우연히 같은 문자열이면(사용자가 가린 내부 이름을
// 기술 칩으로도 등록한 경우), 매 추출 시도가 영원히 막힌다 — stack은 매칭 신호의
// 핵심이라 마스킹하지 않기 때문이다(위 필드 주석 참조. 이 동작 자체는 바꾸지
// 않는다). 전체 스캔이 걸렸을 때 어디서 걸렸는지 짚어주면, 사용자가 "이 칩을
// 빼거나 사전에서 지워라" 식으로 대응할 수 있다. 이 판별은 메시지 문구를 위한
// 것일 뿐 검사의 권위가 아니다 — 전체 payload 스캔이 계속 최종 권위로 남아야,
// 나중에 필드가 추가돼도 빠짐없이 걸린다.
function locatePlaintext(
  payload: ExtractPayload,
  plain: string,
  escaped: string,
): string {
  const hit = (s: string): boolean => s.includes(plain) || s.includes(escaped)
  if (payload.stack.some(hit)) return '기술스택 칩'
  if (payload.catalog.some((c) => hit(c.id) || hit(c.label) || c.keywords.some(hit))) return '개념 목록'
  if (hit(payload.maskedNarrative)) return '서술문'
  return '전송 payload'
}

// 방어의 마지막 층. 조용한 유출을 시끄러운 예외로 바꾼다.
// JSON.stringify는 백슬래시·따옴표·제어문자를 이스케이프하므로, 직렬화된 텍스트에서
// 원문 그대로를 찾으면 그런 문자가 든 키는 payload에 남아 있어도 발견되지 않는다.
// 그래서 원문과 이스케이프된 형태를 함께 본다. 전체 스캔을 먼저 하는 이유는,
// 나중에 payload에 필드가 추가되면 필드별 열거 목록이 조용히 낡기 때문이다 —
// locatePlaintext는 그 전체 스캔이 이미 걸린 뒤에만, 메시지에 위치를 덧붙이려고
// 개별 필드를 들여다본다.
export function assertNoPlaintext(payload: ExtractPayload, dict: Record<string, string>): void {
  const json = JSON.stringify(payload)
  for (const plain of Object.keys(dict)) {
    if (!plain) continue   // 빈 키는 모든 문자열에 걸리므로 검사 대상이 아니다
    const escaped = JSON.stringify(plain).slice(1, -1)   // 양쪽 따옴표 제거
    if (json.includes(plain) || json.includes(escaped)) {
      const location = locatePlaintext(payload, plain, escaped)
      throw new Error(
        `payload에 마스킹되지 않은 원문이 남아 있어 전송을 중단했습니다: ${plain} (위치: ${location})`,
      )
    }
  }
}

// 프로젝트명·기간·역할은 추출에 필요 없으므로 애초에 담지 않는다 (최소 전송).
export function buildExtractPayload(project: Project, nodes: GraphNode[]): ExtractPayload {
  const payload: ExtractPayload = {
    maskedNarrative: applyMask(project.narrative, project.maskDict),
    stack: project.stack,
    lifecycle: project.lifecycle,
    catalog: nodes
      .filter((n) => n.level !== 0)
      .map((n) => ({ id: n.id, label: n.label, keywords: n.keywords })),
  }
  assertNoPlaintext(payload, project.maskDict)
  return payload
}
