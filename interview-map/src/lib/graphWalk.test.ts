import { describe, it, expect } from 'vitest'
import { networkSubgraph, pickStart, nextNode, isOver, MISS_BUDGET } from './graphWalk'
import type { GraphNode, GraphEdge } from '../graph/types'

const N = (id: string, level: 0 | 1 | 2, domain = 'network'): GraphNode => ({
  id,
  label: id,
  domain,
  level,
  icon: '📚',
  summary: '',
  keywords: [],
  status: 'todo',
  position: { x: 0, y: 0 },
})
const E = (source: string, target: string, type: 'hierarchy' | 'crosslink'): GraphEdge => ({ source, target, type })

// network: net-http(L1) → net-httpver(L2); net-http ↔ crosslink net-cors(L2)
// net-tcp(L1) → net-handshake(L2); plus an off-domain node that must be excluded
const nodes: GraphNode[] = [
  N('network', 0), N('net-http', 1), N('net-httpver', 2), N('net-cors', 2),
  N('net-tcp', 1), N('net-handshake', 2), N('spring-mvc', 1, 'spring'),
]
const edges: GraphEdge[] = [
  E('network', 'net-http', 'hierarchy'), E('network', 'net-tcp', 'hierarchy'),
  E('net-http', 'net-httpver', 'hierarchy'), E('net-tcp', 'net-handshake', 'hierarchy'),
  E('net-http', 'net-cors', 'crosslink'), E('net-http', 'spring-mvc', 'crosslink'),
]

describe('networkSubgraph', () => {
  it('network 노드만 + 양끝이 그 안인 엣지만(타 도메인 crosslink 제외)', () => {
    const sub = networkSubgraph(nodes, edges)
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(
      ['net-cors', 'net-handshake', 'net-http', 'net-httpver', 'net-tcp', 'network'])
    // net-http↔spring-mvc crosslink는 spring-mvc가 서브그래프 밖이라 제외
    expect(sub.edges.some((e) => e.target === 'spring-mvc' || e.source === 'spring-mvc')).toBe(false)
  })
})

describe('pickStart', () => {
  it('net-http를 시작으로', () => {
    expect(pickStart(networkSubgraph(nodes, edges))).toBe('net-http')
  })
})

describe('nextNode', () => {
  const sub = networkSubgraph(nodes, edges)
  it('score>=4: 미방문 hierarchy 자식 우선', () => {
    const st = { path: ['net-http'], visited: ['net-http'], misses: 0 }
    expect(nextNode(sub, st, 5)).toBe('net-httpver')
  })
  it('score>=4: 현재 노드의 자식 소진 시 현재의 crosslink', () => {
    // cur=net-http, 자식 net-httpver는 방문됨 → net-http의 crosslink net-cors
    const st = { path: ['net-http'], visited: ['net-http', 'net-httpver'], misses: 0 }
    expect(nextNode(sub, st, 4)).toBe('net-cors')
  })
  it('score==3: 같은 부모 형제 우선', () => {
    const st = { path: ['net-http'], visited: ['net-http'], misses: 0 }
    expect(nextNode(sub, st, 3)).toBe('net-tcp') // network의 다른 자식
  })
  it('score<=2: 형제/부모로 물러남', () => {
    const st = { path: ['net-httpver'], visited: ['net-httpver'], misses: 1 }
    // net-httpver의 형제 없음 → 부모(net-http) 미방문이면 그쪽
    expect(nextNode(sub, st, 2)).toBe('net-http')
  })
  it('막다른 리프 → 백트래킹으로 다른 가지 계속 (path>=3)', () => {
    // cur=net-httpver 막힘(자식·crosslink 없음) → 경로 거슬러: net-http(소진) → network의 미방문 자식 net-tcp
    const st = {
      path: ['network', 'net-http', 'net-httpver'],
      visited: ['network', 'net-http', 'net-httpver', 'net-cors'],
      misses: 0,
    }
    expect(nextNode(sub, st, 5)).toBe('net-tcp')
  })
  it('갈 곳 없으면 null', () => {
    const all = ['network', 'net-http', 'net-httpver', 'net-cors', 'net-tcp', 'net-handshake']
    const st = { path: all, visited: all, misses: 0 }
    expect(nextNode(sub, st, 5)).toBeNull()
  })
})

describe('isOver', () => {
  it('misses >= MISS_BUDGET면 종료', () => {
    expect(isOver({ path: [], visited: [], misses: MISS_BUDGET })).toBe(true)
    expect(isOver({ path: [], visited: [], misses: MISS_BUDGET - 1 })).toBe(false)
  })
})
