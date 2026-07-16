import { describe, it, expect } from 'vitest'
import { layoutNodes } from './layout'
import graphData from '../graph/graph.json'
import type { GraphNode, GraphEdge } from '../graph/types'

const SIZE = { 0: { w: 240, h: 96 }, 1: { w: 176, h: 64 }, 2: { w: 176, h: 64 } } as const

const nodes: GraphNode[] = [
  { id: 'java', label: 'Java', domain: 'java', level: 0, icon: '☕', summary: '', keywords: [], status: 'learning', position: { x: 0, y: 0 } },
  { id: 'jvm', label: 'JVM', domain: 'java', level: 1, icon: '⚙️', summary: '', keywords: [], status: 'studied', position: { x: 0, y: 0 } },
]
const edges: GraphEdge[] = [{ source: 'java', target: 'jvm', type: 'hierarchy' }]

describe('layoutNodes', () => {
  it('positions a parent above its child in a top-down layout', () => {
    const result = layoutNodes(nodes, edges)
    const java = result.find((n) => n.id === 'java')!
    const jvm = result.find((n) => n.id === 'jvm')!

    expect(Number.isFinite(java.position.x)).toBe(true)
    expect(Number.isFinite(java.position.y)).toBe(true)
    expect(Number.isFinite(jvm.position.x)).toBe(true)
    expect(Number.isFinite(jvm.position.y)).toBe(true)

    expect(jvm.position.y).toBeGreaterThan(java.position.y)
  })

  it('places distinct level-0 domains in different grid columns', () => {
    const domainNodes: GraphNode[] = [
      { id: 'java', label: 'Java', domain: 'java', level: 0, icon: '☕', summary: '', keywords: [], status: 'learning', position: { x: 0, y: 0 } },
      { id: 'os', label: 'OS', domain: 'os', level: 0, icon: '💻', summary: '', keywords: [], status: 'learning', position: { x: 0, y: 0 } },
    ]
    const result = layoutNodes(domainNodes, [])
    const java = result.find((n) => n.id === 'java')!
    const os = result.find((n) => n.id === 'os')!

    expect(java.position.x).not.toBeCloseTo(os.position.x)
  })

  it('produces no overlapping node bounding boxes for the real graph', () => {
    const data = graphData as { nodes: GraphNode[]; edges: GraphEdge[] }
    const laid = layoutNodes(data.nodes, data.edges)
    const boxes = laid.map((n) => ({
      id: n.id,
      x1: n.position.x, y1: n.position.y,
      x2: n.position.x + SIZE[n.level].w, y2: n.position.y + SIZE[n.level].h,
    }))
    const overlaps: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
        const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
        if (ox > 1 && oy > 1) overlaps.push(`${a.id} <-> ${b.id}`)
      }
    }
    expect(overlaps).toEqual([])
  })
})
