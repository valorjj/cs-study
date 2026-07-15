import type { GraphNode, GraphEdge } from '../graph/types'

export interface TreeNode {
  node: GraphNode
  children: TreeNode[]
}

// Build a hierarchy forest from `hierarchy` edges. Roots are the level-0
// domain nodes (they have no hierarchy parent). Children keep graph node order.
export function buildTree(nodes: GraphNode[], edges: GraphEdge[]): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parentOf = new Map<string, string>()
  const childIds = new Map<string, string[]>()
  for (const e of edges) {
    if (e.type !== 'hierarchy') continue
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    parentOf.set(e.target, e.source)
    const arr = childIds.get(e.source) ?? []
    arr.push(e.target)
    childIds.set(e.source, arr)
  }
  // Preserve graph node order within each parent's child list.
  const order = new Map(nodes.map((n, i) => [n.id, i]))
  // `seen` guards against cyclic/diamond hierarchy edges (bad data) recursing
  // forever or duplicating a subtree; each node is placed at most once.
  const seen = new Set<string>()
  const build = (id: string): TreeNode => {
    seen.add(id)
    return {
      node: byId.get(id)!,
      children: (childIds.get(id) ?? [])
        .filter((c) => !seen.has(c))
        .sort((a, b) => (order.get(a)! - order.get(b)!))
        .map(build),
    }
  }
  return nodes
    .filter((n) => !parentOf.has(n.id) && n.level === 0)
    .map((n) => build(n.id))
}

// Ancestor ids of a node, ordered root-first (e.g. 'jvm-gc' → ['java','jvm']),
// via hierarchy edges. Used to auto-expand the tree down to a selected node.
export function ancestorsOf(id: string, edges: GraphEdge[]): string[] {
  const parentOf = new Map<string, string>()
  for (const e of edges) if (e.type === 'hierarchy') parentOf.set(e.target, e.source)
  const out: string[] = []
  let cur = parentOf.get(id)
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    out.push(cur)
    seen.add(cur)
    cur = parentOf.get(cur)
  }
  return out.reverse()
}
