import { describe, it, expect } from 'vitest'
import { listDomains } from './domains'
import type { GraphNode } from '../graph/types'

const N = (id: string, level: 0 | 1 | 2, domain: string, label = id): GraphNode => ({
  id, label, domain, level, summary: '', tags: [],
} as unknown as GraphNode)

describe('listDomains', () => {
  const nodes = [
    N('net', 0, 'network', 'Network'),
    N('net-http', 1, 'network'),
    N('net-tcp', 1, 'network'),
    N('net-tcp-cc', 2, 'network'),
    N('java', 0, 'java', 'Java'),
    N('jvm', 1, 'java'),
    N('sec', 0, 'security', '보안 (Security)'),
    N('sec-jwt', 1, 'security'),
  ]

  it('level 0 노드에서 도메인 목록을 유도한다', () => {
    expect(listDomains(nodes).map((d) => d.id).sort()).toEqual(['java', 'network', 'security'])
  })

  it('label은 level 0 노드의 label', () => {
    expect(listDomains(nodes).find((d) => d.id === 'security')?.label).toBe('보안 (Security)')
  })

  it('nodeCount는 level>=1 개념만 센다(도메인 루트 제외)', () => {
    expect(listDomains(nodes).find((d) => d.id === 'network')?.nodeCount).toBe(3)
    expect(listDomains(nodes).find((d) => d.id === 'java')?.nodeCount).toBe(1)
  })

  it('nodeCount 내림차순, 동수면 label 오름차순', () => {
    expect(listDomains(nodes).map((d) => d.id)).toEqual(['network', 'java', 'security'])
  })

  it('level 0 노드가 없는 도메인은 목록에 없다', () => {
    expect(listDomains([N('orphan', 1, 'ghost')])).toEqual([])
  })
})
