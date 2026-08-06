import { describe, it, expect } from 'vitest'
import { toDomainGroups } from './conceptGroups'
import type { MasteryEvidence } from './mastery'
import type { Match, MatchVia } from './resumeTypes'
import type { GraphNode } from '../graph/types'

// conceptMatch.test.ts 의 node() 헬퍼와 같은 형태. 도메인 두 개를 쓴다.
const node = (
  id: string, label: string, domain: string, level: 0 | 1 | 2 = 1,
): GraphNode => ({
  id, label, domain, level, icon: '', summary: '', keywords: [],
  status: 'todo', position: { x: 0, y: 0 },
})

const nodes: GraphNode[] = [
  node('database', 'Database', 'database', 0),
  node('db-tx', '트랜잭션', 'database'),
  node('db-isolation', '격리수준', 'database'),
  node('system-design', 'System Design', 'system-design', 0),
  node('sd-mq', '메시지 큐', 'system-design'),
]

const m = (nodeId: string, via: MatchVia = 'chip'): Match => ({ nodeId, via, evidence: 'x' })

describe('toDomainGroups', () => {
  const ev: MasteryEvidence = {
    srsKeysByNode: new Map(), srs: {}, quizStats: {},
    domainOfNode: (id) => nodes.find((n) => n.id === id)?.domain ?? '',
  }

  it('groups by node domain and labels the group with the level-0 node', () => {
    const g = toDomainGroups([m('db-tx'), m('sd-mq'), m('db-isolation')], nodes, ev)
    expect(g.map((x) => [x.domain, x.label])).toEqual([
      ['database', 'Database'],
      ['system-design', 'System Design'],
    ])
    expect(g[0].items.map((i) => i.nodeId)).toEqual(['db-tx', 'db-isolation'])
    expect(g[1].items.map((i) => i.nodeId)).toEqual(['sd-mq'])
  })

  it('drops matches whose nodeId is not in the graph', () => {
    // LLM 환각 id는 mergeLlm이 이미 거르지만, 그래프에서 노드가 삭제된 뒤 저장된
    // 오래된 프로젝트도 같은 상태가 된다. 어댑터가 조용히 버려야 지도가 안 깨진다.
    expect(toDomainGroups([m('no-such-node')], nodes, ev)).toEqual([])
  })

  it('never emits a level-0 domain node as a concept item', () => {
    // 도메인 헤더는 개념이 아니다. ring 1에 이미 그려지므로 ring 2에 또 나오면
    // 자기 자신을 가리키는 노드가 생긴다.
    expect(toDomainGroups([m('database')], nodes, ev)).toEqual([])
  })

  it('deduplicates a nodeId that appears twice', () => {
    // 칩과 키워드가 같은 노드를 잡을 수 있다. matchLocal은 노드당 한 번만 emit하지만
    // mergeLlm 이후의 배열은 그 보장을 물려받지 않는다.
    const g = toDomainGroups([m('db-tx', 'chip'), m('db-tx', 'keyword')], nodes, ev)
    expect(g[0].items).toHaveLength(1)
    expect(g[0].items[0].via).toBe('chip')   // 먼저 온 것을 남긴다
  })

  it('assigns the tier from mastery evidence', () => {
    // srs 기록이 전혀 없으면 'unverified' — "구멍"이 아니라 "확인 필요"다.
    expect(toDomainGroups([m('db-tx')], nodes, ev)[0].items[0].tier).toBe('unverified')

    const solid: MasteryEvidence = {
      ...ev,
      srsKeysByNode: new Map([['db-tx', ['k1']]]),
      srs: { k1: { ef: 2.5, interval: 10, reps: 3, lapses: 0, due: '2026-09-01' } },
    }
    expect(toDomainGroups([m('db-tx')], nodes, solid)[0].items[0].tier).toBe('solid')
  })

  it('orders groups deterministically regardless of match order', () => {
    // 지도가 렌더마다 흔들리면 사용자는 자기가 뭘 봤는지 잃는다.
    const a = toDomainGroups([m('sd-mq'), m('db-tx')], nodes, ev)
    const b = toDomainGroups([m('db-tx'), m('sd-mq')], nodes, ev)
    expect(a.map((x) => x.domain)).toEqual(b.map((x) => x.domain))
  })
})
