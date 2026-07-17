import { describe, it, expect } from 'vitest'
import graphData from '../graph/graph.json'
import { CURATED_TRACKS } from '../graph/tracks'
import { buildDomainTracks, trackProgress, nextStepIndex, type Track } from './tracks'
import type { GraphNode, GraphEdge } from '../graph/types'

const N = (id: string, level: 0 | 1 | 2, domain = 'java'): GraphNode => ({
  id, label: id, domain, level, icon: '', summary: '', keywords: [], status: 'learning', position: { x: 0, y: 0 },
})
const nodes: GraphNode[] = [N('java', 0), N('jvm', 1), N('jvm-gc', 2), N('collections', 1)]
const edges: GraphEdge[] = [
  { source: 'java', target: 'jvm', type: 'hierarchy' },
  { source: 'jvm', target: 'jvm-gc', type: 'hierarchy' },
  { source: 'java', target: 'collections', type: 'hierarchy' },
]

describe('buildDomainTracks', () => {
  it('makes one track per domain, tree order, excluding the L0 node', () => {
    const tracks = buildDomainTracks(nodes, edges)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].id).toBe('domain:java')
    expect(tracks[0].steps).toEqual(['jvm', 'jvm-gc', 'collections'])
  })
})

describe('trackProgress', () => {
  const t: Track = { id: 't', title: '', description: '', icon: '', steps: ['a', 'b', 'c'] }
  it('counts studied steps', () => {
    expect(trackProgress(t, new Set(['a', 'c']))).toEqual({ done: 2, total: 3 })
    expect(trackProgress(t, new Set())).toEqual({ done: 0, total: 3 })
  })
})

describe('nextStepIndex', () => {
  const t: Track = { id: 't', title: '', description: '', icon: '', steps: ['a', 'b', 'c'] }
  it('returns the first unstudied index, or -1 when complete', () => {
    expect(nextStepIndex(t, new Set())).toBe(0)
    expect(nextStepIndex(t, new Set(['a']))).toBe(1)
    expect(nextStepIndex(t, new Set(['a', 'b', 'c']))).toBe(-1)
  })
})

describe('CURATED_TRACKS validity', () => {
  const ids = new Set((graphData as { nodes: GraphNode[] }).nodes.map((n) => n.id))
  const l0 = new Set((graphData as { nodes: GraphNode[] }).nodes.filter((n) => n.level === 0).map((n) => n.id))
  it('every curated step id exists and is not a domain (L0) node', () => {
    for (const t of CURATED_TRACKS) {
      expect(t.steps.length).toBeGreaterThan(0)
      for (const s of t.steps) {
        expect(ids.has(s), `${t.id} step ${s} missing`).toBe(true)
        expect(l0.has(s), `${t.id} step ${s} is L0`).toBe(false)
      }
    }
  })
})
