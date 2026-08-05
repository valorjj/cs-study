// 개념별 숙련도 등급. 증거의 신뢰 순서는 srs 기록 > 도메인 정답률 > studiedIds 이며,
// studiedIds(수동 체크박스)는 아예 쓰지 않는다 — 체크가 없다는 건 "모른다"가 아니라
// "누른 적 없다"인 경우가 대부분이고, 그러면 지도가 온통 빨강이 되어 정보량이 0이 된다.
import type { SrsState } from './srs'
import type { QuizStat } from '../store/graphStore'

export type Tier = 'solid' | 'shaky' | 'unverified'

export interface MasteryEvidence {
  srsKeysByNode: Map<string, string[]>          // 노드 → 그 노드에 달린 카드 키들
  srs: SrsState
  quizStats: Record<string, QuizStat>
  domainOfNode: (nodeId: string) => string
}

const DOMAIN_RATE_FLOOR = 0.8
const DOMAIN_MIN_SEEN = 3
const SOLID_MIN_REPS = 2

export function tierOf(nodeId: string, ev: MasteryEvidence): Tier {
  const keys = ev.srsKeysByNode.get(nodeId) ?? []
  const cards = keys.map((k) => ev.srs[k]).filter((c): c is NonNullable<typeof c> => !!c)

  // 1) 직접 증거가 전혀 없음 → "구멍"이 아니라 "확인 필요"
  if (cards.length === 0) return 'unverified'

  // 2) 한 장이라도 잊은 적이 있으면 흔들린다
  if (cards.some((c) => c.lapses > 0)) return 'shaky'

  // 3) 도메인 수준 간접 증거
  const stat = ev.quizStats[ev.domainOfNode(nodeId)]
  if (stat && stat.seen >= DOMAIN_MIN_SEEN && stat.correct / stat.seen < DOMAIN_RATE_FLOOR) {
    return 'shaky'
  }

  // 4) 한 번 맞춘 것으로는 solid라 하지 않는다
  if (Math.max(...cards.map((c) => c.reps)) < SOLID_MIN_REPS) return 'shaky'

  return 'solid'
}
