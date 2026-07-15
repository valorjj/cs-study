import { describe, it, expect } from 'vitest'
import { layoutNodes } from './layout'
import type { GraphNode, GraphEdge } from '../graph/types'

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
})
