import type { GraphNode } from '../graph/types'

export function searchNodes(query: string, nodes: GraphNode[]): GraphNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return nodes
    .filter((n) =>
      n.label.toLowerCase().includes(q) ||
      n.keywords.some((k) => k.toLowerCase().includes(q)))
    .slice(0, 8)
}
