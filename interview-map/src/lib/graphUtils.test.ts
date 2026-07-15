import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges, buildAdjacency } from './graphUtils'
import type { GraphNode, GraphEdge } from '../graph/types'

const nodes: GraphNode[] = [
  { id: 'java', label: 'Java', domain: 'java', level: 0, icon: '☕', summary: '', keywords: [], status: 'learning', position: { x: 0, y: 0 } },
  { id: 'jvm', label: 'JVM', domain: 'java', level: 1, icon: '⚙️', summary: '', keywords: [], status: 'studied', position: { x: 10, y: 20 } },
]
const edges: GraphEdge[] = [
  { source: 'java', target: 'jvm', type: 'hierarchy' },
  { source: 'jvm', target: 'os-memory', type: 'crosslink', label: '메모리' },
]

describe('graphUtils', () => {
  it('toFlowNodes maps level to node type and keeps position', () => {
    const flow = toFlowNodes(nodes)
    expect(flow[0].type).toBe('domain')
    expect(flow[1].type).toBe('concept')
    expect(flow[1].position).toEqual({ x: 10, y: 20 })
    expect((flow[0].data as any).node.id).toBe('java')
  })
  it('toFlowEdges styles hierarchy as smoothstep and crosslink as straight dashed', () => {
    const flow = toFlowEdges(edges)
    expect(flow[0].animated).toBe(false)
    expect(flow[1].animated).toBe(false)
    expect(flow[0].type).toBe('smoothstep')
    expect(flow[1].type).toBe('straight')
    expect(flow[1].id).toBe('jvm-os-memory')
  })
  it('buildAdjacency is bidirectional', () => {
    const adj = buildAdjacency(edges)
    expect(adj.get('java')).toContain('jvm')
    expect(adj.get('jvm')).toEqual(expect.arrayContaining(['java', 'os-memory']))
    expect(adj.get('os-memory')).toContain('jvm')
  })
})
