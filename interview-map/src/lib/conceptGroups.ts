// Match[]는 노드 id의 평평한 목록이고 layoutRadial은 도메인별 묶음을 원한다.
// 이 어댑터가 유일한 변환 지점이다 — 모달이 직접 묶으면 테스트가 렌더에 갇힌다.
import { tierOf } from './mastery'
import type { MasteryEvidence } from './mastery'
import type { DomainGroup, ConceptItem } from './radial'
import type { Match } from './resumeTypes'
import type { GraphNode } from '../graph/types'

export function toDomainGroups(
  matches: Match[], nodes: GraphNode[], ev: MasteryEvidence,
): DomainGroup[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const domainLabel = new Map(
    nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label]),
  )
  const groups = new Map<string, ConceptItem[]>()
  const seen = new Set<string>()

  for (const m of matches) {
    if (seen.has(m.nodeId)) continue
    const node = byId.get(m.nodeId)
    // 그래프에 없는 id, 그리고 도메인 헤더 노드는 개념이 아니다.
    if (!node || node.level === 0) continue
    seen.add(m.nodeId)
    const list = groups.get(node.domain) ?? []
    list.push({ nodeId: node.id, label: node.label, tier: tierOf(node.id, ev), via: m.via })
    groups.set(node.domain, list)
  }

  // 도메인 id 정렬 — 결정적이어야 지도가 렌더마다 흔들리지 않는다.
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, items]) => ({ domain, label: domainLabel.get(domain) ?? domain, items }))
}
