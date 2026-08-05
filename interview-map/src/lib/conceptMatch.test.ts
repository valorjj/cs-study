import { describe, it, expect } from 'vitest'
import { normalizeTerm, matchLocal, mergeLlm } from './conceptMatch'
import type { GraphNode } from '../graph/types'

const node = (id: string, label: string, keywords: string[], level: 0 | 1 | 2 = 1): GraphNode => ({
  id, label, domain: 'database', level, icon: '', summary: '',
  keywords, status: 'todo', position: { x: 0, y: 0 },
})

const nodes: GraphNode[] = [
  node('database', 'Database', ['인덱스', '트랜잭션'], 0),
  node('db-nosql', 'SQL vs NoSQL / Redis', ['NoSQL', 'Redis', '캐시']),
  node('db-isolation', '격리수준·이상현상', ['격리수준', '팬텀리드']),
  node('sd-mq', 'Message Queue', ['Kafka', '비동기']),
  node('spring-ioc', 'IoC / DI', ['IoC', 'DI', '생성자주입']),
]

describe('normalizeTerm', () => {
  it('lowercases and strips spaces, hyphens, underscores and dots', () => {
    expect(normalizeTerm('Spring Boot')).toBe('springboot')
    expect(normalizeTerm('B-Tree')).toBe('btree')
    expect(normalizeTerm('TCP_NODELAY')).toBe('tcpnodelay')
  })
})

describe('matchLocal', () => {
  it('matches stack chips to nodes via keywords', () => {
    const m = matchLocal({ stack: ['Redis', 'Kafka'], narrative: '' }, nodes)
    expect(m.map((x) => x.nodeId).sort()).toEqual(['db-nosql', 'sd-mq'])
    expect(m.every((x) => x.via === 'chip')).toBe(true)
  })

  it('matches a chip whose spacing differs from the keyword', () => {
    const m = matchLocal({ stack: ['no sql'], narrative: '' }, nodes)
    expect(m.map((x) => x.nodeId)).toEqual(['db-nosql'])
  })

  it('matches narrative terms of 3+ chars by substring', () => {
    const m = matchLocal({ stack: [], narrative: '격리수준을 올렸더니 팬텀리드가 사라졌다' }, nodes)
    expect(m.map((x) => x.nodeId)).toEqual(['db-isolation'])
    expect(m[0].via).toBe('keyword')
  })

  it('matches a 2-char term only as a whole token, not as a substring', () => {
    const inside = matchLocal({ stack: [], narrative: '디아이가 아니라 다른 얘기' }, nodes)
    expect(inside.map((x) => x.nodeId)).not.toContain('spring-ioc')
    const token = matchLocal({ stack: [], narrative: 'DI 로 주입했다' }, nodes)
    expect(token.map((x) => x.nodeId)).toContain('spring-ioc')
  })

  it('never returns a level-0 domain node — those are group headers', () => {
    const m = matchLocal({ stack: [], narrative: '인덱스와 트랜잭션 이야기' }, nodes)
    expect(m.map((x) => x.nodeId)).not.toContain('database')
  })

  it('keeps chip over keyword when both hit the same node, and dedupes', () => {
    const m = matchLocal({ stack: ['Redis'], narrative: 'Redis 캐시를 붙였다' }, nodes)
    expect(m.filter((x) => x.nodeId === 'db-nosql')).toHaveLength(1)
    expect(m.find((x) => x.nodeId === 'db-nosql')!.via).toBe('chip')
  })

  it('records the matching term as evidence', () => {
    const m = matchLocal({ stack: ['Kafka'], narrative: '' }, nodes)
    expect(m[0].evidence).toBe('Kafka')
  })
})

describe('mergeLlm', () => {
  const local: Match[] = [{ nodeId: 'db-nosql', via: 'chip', evidence: 'Redis' }]

  it('adds valid new ids as via=llm with the reason as evidence', () => {
    const out = mergeLlm(local, {
      nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '중복 결제는 격리수준 문제로 이어진다' },
    }, nodes)
    expect(out.dropped).toBe(0)
    const added = out.matches.find((m) => m.nodeId === 'db-isolation')!
    expect(added.via).toBe('llm')
    expect(added.evidence).toBe('중복 결제는 격리수준 문제로 이어진다')
  })

  it('drops hallucinated ids and counts them', () => {
    const out = mergeLlm(local, { nodeIds: ['not-a-real-node', 'db-isolation'], reasons: {} }, nodes)
    expect(out.dropped).toBe(1)
    expect(out.matches.map((m) => m.nodeId).sort()).toEqual(['db-isolation', 'db-nosql'])
  })

  it('drops level-0 domain ids too', () => {
    const out = mergeLlm(local, { nodeIds: ['database'], reasons: {} }, nodes)
    expect(out.dropped).toBe(1)
    expect(out.matches).toHaveLength(1)
  })

  it('does not duplicate or downgrade an id already matched locally', () => {
    const out = mergeLlm(local, { nodeIds: ['db-nosql'], reasons: { 'db-nosql': 'x' } }, nodes)
    expect(out.dropped).toBe(0)
    expect(out.matches).toHaveLength(1)
    expect(out.matches[0].via).toBe('chip')
  })

  it('falls back to a generic evidence string when no reason is given', () => {
    const out = mergeLlm([], { nodeIds: ['db-isolation'], reasons: {} }, nodes)
    expect(out.matches[0].evidence).toBe('서술문에서 암시됨')
  })
})
