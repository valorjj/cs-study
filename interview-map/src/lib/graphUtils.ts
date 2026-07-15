import type { Node, Edge } from '@xyflow/react'
import type { GraphNode, GraphEdge } from '../graph/types'

export function toFlowNodes(nodes: GraphNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: { node },
    type: node.level === 0 ? 'domain' : 'concept',
  }))
}

export function toFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e) => {
    const isCross = e.type === 'crosslink'
    return {
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      data: { type: e.type, label: e.label },
      type: isCross ? 'straight' : 'smoothstep',
      animated: false,
      style: isCross
        ? { stroke: '#475569', strokeDasharray: '6 5', strokeWidth: 1 }
        : { stroke: '#334155', strokeWidth: 1.5 },
    }
  })
}

export function buildAdjacency(edges: GraphEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  const add = (a: string, b: string) => {
    const list = adj.get(a) ?? []
    if (!list.includes(b)) list.push(b)
    adj.set(a, list)
  }
  for (const e of edges) {
    add(e.source, e.target)
    add(e.target, e.source)
  }
  return adj
}
