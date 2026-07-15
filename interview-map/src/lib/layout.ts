import dagre from '@dagrejs/dagre'
import type { GraphNode, GraphEdge } from '../graph/types'

const SIZE = { 0: { w: 240, h: 96 }, 1: { w: 176, h: 64 }, 2: { w: 176, h: 64 } } as const

const COLS = 4
const CELL_W = 1200
const CELL_H = 800

export function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const hierarchyEdges = edges.filter((e) => e.type === 'hierarchy')

  // Build children map from hierarchy edges only.
  const childrenOf = new Map<string, string[]>()
  for (const e of hierarchyEdges) {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, [])
    childrenOf.get(e.source)!.push(e.target)
  }

  const domains = nodes.filter((n) => n.level === 0)

  const positions = new Map<string, { x: number; y: number }>()

  domains.forEach((domain, i) => {
    // BFS the domain's subtree (domain + all hierarchy descendants).
    const subtreeIds: string[] = []
    const visited = new Set<string>()
    const queue: string[] = [domain.id]
    visited.add(domain.id)
    while (queue.length > 0) {
      const cur = queue.shift()!
      subtreeIds.push(cur)
      for (const child of childrenOf.get(cur) ?? []) {
        if (!visited.has(child)) {
          visited.add(child)
          queue.push(child)
        }
      }
    }

    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 45, ranksep: 85, marginx: 20, marginy: 20 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const id of subtreeIds) {
      const n = nodeById.get(id)
      if (!n) continue
      const s = SIZE[n.level]
      g.setNode(id, { width: s.w, height: s.h })
    }
    for (const e of hierarchyEdges) {
      if (visited.has(e.source) && visited.has(e.target)) {
        g.setEdge(e.source, e.target)
      }
    }

    dagre.layout(g)

    // Convert dagre center coords → top-left.
    const rawTopLeft = new Map<string, { x: number; y: number }>()
    for (const id of subtreeIds) {
      const p = g.node(id)
      if (!p) continue
      const n = nodeById.get(id)!
      const s = SIZE[n.level]
      rawTopLeft.set(id, { x: p.x - s.w / 2, y: p.y - s.h / 2 })
    }

    const col = i % COLS
    const row = Math.floor(i / COLS)
    const rootSize = SIZE[domain.level]
    const targetRootX = col * CELL_W + (CELL_W - rootSize.w) / 2
    const targetRootY = row * CELL_H

    const rootTopLeft = rawTopLeft.get(domain.id) ?? { x: 0, y: 0 }
    const dx = targetRootX - rootTopLeft.x
    const dy = targetRootY - rootTopLeft.y

    for (const id of subtreeIds) {
      const p = rawTopLeft.get(id)
      if (!p) continue
      positions.set(id, { x: p.x + dx, y: p.y + dy })
    }
  })

  return nodes.map((n) => {
    const p = positions.get(n.id)
    return p ? { ...n, position: p } : n
  })
}
