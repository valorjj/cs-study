import dagre from '@dagrejs/dagre'
import type { GraphNode, GraphEdge } from '../graph/types'

const SIZE = { 0: { w: 240, h: 96 }, 1: { w: 176, h: 64 }, 2: { w: 176, h: 64 } } as const

const COLS = 4
const CELL_H = 800
const MIN_CELL_W = 1200
// Horizontal breathing room between a cell edge and the widest subtree it holds.
const CELL_GAP = 160

type DomainLayout = {
  domain: GraphNode
  ids: string[]
  rawTopLeft: Map<string, { x: number; y: number }>
  minX: number
  maxX: number
  rootTopY: number
}

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

  // Pass 1: lay out each domain's subtree with dagre and record its x-extent.
  const layouts: DomainLayout[] = domains.map((domain) => {
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

    // Convert dagre center coords → top-left, tracking the subtree x-extent.
    const rawTopLeft = new Map<string, { x: number; y: number }>()
    let minX = Infinity
    let maxX = -Infinity
    for (const id of subtreeIds) {
      const p = g.node(id)
      if (!p) continue
      const n = nodeById.get(id)!
      const s = SIZE[n.level]
      const tl = { x: p.x - s.w / 2, y: p.y - s.h / 2 }
      rawTopLeft.set(id, tl)
      minX = Math.min(minX, tl.x)
      maxX = Math.max(maxX, tl.x + s.w)
    }

    const rootTopLeft = rawTopLeft.get(domain.id) ?? { x: 0, y: 0 }
    return { domain, ids: subtreeIds, rawTopLeft, minX, maxX, rootTopY: rootTopLeft.y }
  })

  // Uniform cell width sized to the widest subtree so no subtree ever crosses
  // into a neighbouring column (fixes cross-domain overlap, e.g. db ↔ systemdesign).
  const maxSubtreeWidth = layouts.reduce((m, l) => Math.max(m, l.maxX - l.minX), 0)
  const CELL_W = Math.max(MIN_CELL_W, Math.ceil(maxSubtreeWidth + CELL_GAP))

  // Pass 2: place each subtree centered in its grid cell.
  const positions = new Map<string, { x: number; y: number }>()
  layouts.forEach((l, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const subtreeCenterX = (l.minX + l.maxX) / 2
    const targetCenterX = col * CELL_W + CELL_W / 2
    const dx = targetCenterX - subtreeCenterX
    const dy = row * CELL_H - l.rootTopY

    for (const id of l.ids) {
      const p = l.rawTopLeft.get(id)
      if (!p) continue
      positions.set(id, { x: p.x + dx, y: p.y + dy })
    }
  })

  return nodes.map((n) => {
    const p = positions.get(n.id)
    return p ? { ...n, position: p } : n
  })
}
