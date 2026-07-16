type L = { id: string; level: 0 | 1 | 2 }
type E = { source: string; target: string }

/** 현재 선택으로 인해 L2 자식들이 펼쳐지는 부모 L1의 id. 없으면 null. */
export function activeParentId(
  selectedId: string | null,
  nodes: ReadonlyArray<L>,
  hierarchyEdges: ReadonlyArray<E>,
): string | null {
  if (!selectedId) return null
  const levelById = new Map(nodes.map((n) => [n.id, n.level]))
  const parentOf = new Map<string, string>()
  for (const e of hierarchyEdges) parentOf.set(e.target, e.source)

  const lvl = levelById.get(selectedId)
  if (lvl === 1) return selectedId
  if (lvl === 2) return parentOf.get(selectedId) ?? null
  return null
}

/** 현재 화면에 보여야 할 L2 노드 id 집합. */
export function visibleL2Ids(
  selectedId: string | null,
  nodes: ReadonlyArray<L>,
  hierarchyEdges: ReadonlyArray<E>,
): Set<string> {
  const active = activeParentId(selectedId, nodes, hierarchyEdges)
  if (!active) return new Set<string>()

  const parentOf = new Map<string, string>()
  for (const e of hierarchyEdges) parentOf.set(e.target, e.source)

  const result = new Set<string>()
  for (const n of nodes) {
    if (n.level === 2 && parentOf.get(n.id) === active) result.add(n.id)
  }
  return result
}

/** L2 자식을 하나 이상 가진 L1 노드 id 집합(체브론 힌트 대상). */
export function parentIdsWithChildren(
  nodes: ReadonlyArray<L>,
  hierarchyEdges: ReadonlyArray<E>,
): Set<string> {
  const levelById = new Map(nodes.map((n) => [n.id, n.level]))
  const result = new Set<string>()
  for (const e of hierarchyEdges) {
    if (levelById.get(e.target) === 2 && levelById.get(e.source) === 1) result.add(e.source)
  }
  return result
}
