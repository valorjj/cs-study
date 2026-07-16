export function visibleL2Ids(
  selectedId: string | null,
  nodes: ReadonlyArray<{ id: string; level: 0 | 1 | 2 }>,
  hierarchyEdges: ReadonlyArray<{ source: string; target: string }>,
): Set<string> {
  const empty = new Set<string>()
  if (!selectedId) return empty

  const levelById = new Map(nodes.map((n) => [n.id, n.level]))
  const parentOf = new Map<string, string>()
  for (const e of hierarchyEdges) parentOf.set(e.target, e.source)

  const selectedLevel = levelById.get(selectedId)
  let activeParent: string | undefined
  if (selectedLevel === 1) activeParent = selectedId
  else if (selectedLevel === 2) activeParent = parentOf.get(selectedId)
  if (!activeParent) return empty

  const result = new Set<string>()
  for (const n of nodes) {
    if (n.level === 2 && parentOf.get(n.id) === activeParent) result.add(n.id)
  }
  return result
}
