import dagre from '@dagrejs/dagre'
import type { GraphNode, GraphEdge } from '../graph/types'

const SIZE = { 0: { w: 200, h: 76 }, 1: { w: 168, h: 60 }, 2: { w: 168, h: 60 } } as const

export function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 55, ranksep: 90, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) {
    const s = SIZE[n.level]
    g.setNode(n.id, { width: s.w, height: s.h })
  }
  for (const e of edges) {
    if (e.type === 'hierarchy') g.setEdge(e.source, e.target)
  }
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    // dagre gives center coords; React Flow uses top-left → offset by half size
    const s = SIZE[n.level]
    return p ? { ...n, position: { x: p.x - s.w / 2, y: p.y - s.h / 2 } } : n
  })
}
