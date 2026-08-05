import { describe, it, expect } from 'vitest'
import { matchLocal } from './conceptMatch'
import { SETTLEMENT_FIXTURE } from './__fixtures__/settlementProject'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'

const nodes = (graphData as GraphData).nodes

describe('matchLocal on a realistic project narrative', () => {
  const matches = matchLocal(SETTLEMENT_FIXTURE, nodes)
  const ids = matches.map((m) => m.nodeId)

  it('resolves every match to a real concept node', () => {
    const concept = new Set(nodes.filter((n) => n.level !== 0).map((n) => n.id))
    expect(ids.filter((id) => !concept.has(id))).toEqual([])
  })

  it('finds the concepts the stack chips name outright', () => {
    expect(ids).toContain('db-nosql')   // Redis
    expect(ids).toContain('sd-mq')      // Kafka
    expect(ids).toContain('devops-docker')
  })

  it('finds a 2-char Korean keyword that only appears with a particle attached', () => {
    // 서술문의 "캐시에 올렸다" — 조사 '에'가 붙어 토큰이 "캐시에"가 된다.
    // 이 단정이 깨지면 PARTICLES 경로가 회귀한 것이고, 그 구멍은 LLM 패스도
    // 메우지 못한다(LLM은 이름이 안 나온 개념만 찾도록 프롬프트되어 있다).
    expect(ids).toContain('sd-cache')
  })

  it('stays in a range a radial map can render', () => {
    // 상한을 넘으면 도메인당 cap이 정보를 너무 많이 접는다는 신호다.
    expect(ids.length).toBeGreaterThan(4)
    expect(ids.length).toBeLessThan(40)
  })

  it('does NOT surface the implied concepts — this is the LLM pass\'s job', () => {
    // 이 세 개는 서술문에 이름이 없다. 로컬이 잡으면 규칙이 과하게 넓어진 것이고,
    // 못 잡는 것이 정상이다. extract 함수가 채워야 하는 정확한 빈칸이 여기다.
    expect(ids).not.toContain('sd-distributed-tx')
    expect(ids).not.toContain('sd-resilience')
    expect(ids).not.toContain('devops-observability')
  })
})
