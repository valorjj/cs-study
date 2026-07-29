import type { GraphNode } from '../graph/types'

export interface DomainOption {
  id: string
  label: string
  /** 면접 가능한 개념 수 = level >= 1 노드. 도메인 루트(level 0)는 제외. */
  nodeCount: number
}

/**
 * 도메인 목록을 그래프에서 유도한다. level 0 노드가 곧 도메인 정의이므로
 * 하드코딩 목록이 없고, 노드를 추가하면 자동으로 반영된다.
 * 내용이 많은 도메인이 위로 오도록 nodeCount 내림차순(동수면 label 오름차순).
 */
export function listDomains(nodes: GraphNode[]): DomainOption[] {
  const counts = new Map<string, number>()
  for (const n of nodes) {
    if (n.level >= 1) counts.set(n.domain, (counts.get(n.domain) ?? 0) + 1)
  }
  return nodes
    .filter((n) => n.level === 0)
    .map((n) => ({ id: n.domain, label: n.label, nodeCount: counts.get(n.domain) ?? 0 }))
    .sort((a, b) => b.nodeCount - a.nodeCount || a.label.localeCompare(b.label))
}
