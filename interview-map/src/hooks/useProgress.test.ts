import { describe, it, expect } from 'vitest'
import { mergeStatus, domainProgress } from './useProgress'
import type { GraphNode } from '../graph/types'

describe('mergeStatus', () => {
  it('visitor studied overrides', () => expect(mergeStatus('todo', true)).toBe('studied'))
  it('falls back to author status', () => expect(mergeStatus('learning', false)).toBe('learning'))
})

describe('domainProgress', () => {
  const nodes: GraphNode[] = [
    { id: 'a', label: '', domain: 'java', level: 1, icon: '', summary: '', keywords: [], status: 'studied', position: { x: 0, y: 0 } },
    { id: 'b', label: '', domain: 'java', level: 2, icon: '', summary: '', keywords: [], status: 'todo', position: { x: 0, y: 0 } },
  ]
  it('computes studied ratio per domain', () => {
    const r = domainProgress(nodes, (n) => n.status)
    expect(r.find((x) => x.domain === 'java')).toMatchObject({ studied: 1, total: 2, pct: 50 })
  })
})
