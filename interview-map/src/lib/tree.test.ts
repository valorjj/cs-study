import { describe, it, expect } from 'vitest'
import { buildTree, ancestorsOf } from './tree'
import graphData from '../graph/graph.json'
import type { GraphData, GraphNode, GraphEdge } from '../graph/types'

const data = graphData as GraphData

describe('buildTree (real graph)', () => {
  const tree = buildTree(data.nodes, data.edges)

  it('produces 11 domain roots (all level 0)', () => {
    expect(tree).toHaveLength(11)
    expect(tree.every((t) => t.node.level === 0)).toBe(true)
  })

  it('nests JVM sub-concepts under jvm under java (3 levels)', () => {
    const java = tree.find((t) => t.node.id === 'java')!
    const jvm = java.children.find((c) => c.node.id === 'jvm')!
    const subIds = jvm.children.map((c) => c.node.id)
    expect(subIds).toEqual(expect.arrayContaining(['jvm-gc', 'jvm-jit', 'jvm-classloader', 'jvm-memory']))
  })

  it('every non-root node appears exactly once in the tree', () => {
    const seen: string[] = []
    const walk = (t: { node: { id: string }; children: unknown[] }) => {
      seen.push(t.node.id)
      ;(t.children as { node: { id: string }; children: unknown[] }[]).forEach(walk)
    }
    tree.forEach(walk)
    expect(new Set(seen).size).toBe(seen.length) // no duplicates
    expect(seen.length).toBe(data.nodes.length)  // every node placed
  })
})

describe('buildTree (synthetic)', () => {
  const nodes: GraphNode[] = [
    { id: 'a', label: 'A', domain: 'a', level: 0, icon: '', summary: '', keywords: [], status: 'todo', position: { x: 0, y: 0 } },
    { id: 'a2', label: 'A2', domain: 'a', level: 1, icon: '', summary: '', keywords: [], status: 'todo', position: { x: 0, y: 0 } },
    { id: 'a1', label: 'A1', domain: 'a', level: 1, icon: '', summary: '', keywords: [], status: 'todo', position: { x: 0, y: 0 } },
  ]
  const edges: GraphEdge[] = [
    { source: 'a', target: 'a2', type: 'hierarchy' },
    { source: 'a', target: 'a1', type: 'hierarchy' },
    { source: 'a1', target: 'a2', type: 'crosslink' }, // must be ignored
  ]

  it('orders children by graph node order, not edge order', () => {
    const tree = buildTree(nodes, edges)
    expect(tree[0].children.map((c) => c.node.id)).toEqual(['a2', 'a1'])
  })

  it('ignores crosslink edges', () => {
    const tree = buildTree(nodes, edges)
    // a1 has no hierarchy children (its only outgoing edge is a crosslink)
    expect(tree[0].children.find((c) => c.node.id === 'a1')!.children).toHaveLength(0)
  })
})

describe('ancestorsOf', () => {
  it('returns root-first ancestor path', () => {
    expect(ancestorsOf('jvm-gc', data.edges)).toEqual(['java', 'jvm'])
  })
  it('returns empty for a root', () => {
    expect(ancestorsOf('java', data.edges)).toEqual([])
  })
})
