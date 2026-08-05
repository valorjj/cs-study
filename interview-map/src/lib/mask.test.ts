import { describe, it, expect } from 'vitest'
import { buildNeverMask, findCandidates, buildMaskDict, applyMask } from './mask'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'

const nodes = (graphData as GraphData).nodes

describe('buildNeverMask', () => {
  it('contains every node keyword and label, normalized', () => {
    const never = buildNeverMask(nodes)
    expect(never.has('redis')).toBe(true)
    expect(never.has('kafka')).toBe(true)
    expect(never.has('mvcc')).toBe(true)
    expect(never.has('격리수준')).toBe(true)
  })
})

describe('findCandidates', () => {
  const never = buildNeverMask(nodes)

  it('never proposes a tech term that appears in the graph keywords', () => {
    const text = 'Redis 캐시와 Kafka 컨슈머에서 MVCC 격리수준 문제가 났다. Redis Redis Kafka'
    expect(findCandidates(text, never)).toEqual([])
  })

  it('flags Korean company markers', () => {
    const c = findCandidates('(주)가상상사 정산 팀에서 작업했다', never)
    expect(c.map((x) => x.text)).toContain('가상상사')
    expect(c.find((x) => x.text === '가상상사')!.kind).toBe('company')
  })

  it('flags contact-shaped strings', () => {
    const c = findCandidates('문의는 ops@example.test 또는 010-0000-0000 으로', never)
    const texts = c.map((x) => x.text)
    expect(texts).toContain('ops@example.test')
    expect(texts).toContain('010-0000-0000')
    expect(c.every((x) => x.kind === 'contact')).toBe(true)
  })

  it('flags an unknown CamelCase internal system name', () => {
    const c = findCandidates('SettleHub 에서 배치를 돌렸다. SettleHub 로그를 봤다', never)
    const hub = c.find((x) => x.text === 'SettleHub')
    expect(hub).toBeDefined()
    expect(hub!.kind).toBe('system')
    expect(hub!.count).toBe(2)
  })

  it('ignores an unknown latin token that appears only once', () => {
    const c = findCandidates('Foo 라는 걸 한 번 썼다', never)
    expect(c.map((x) => x.text)).not.toContain('Foo')
  })

  it('returns each candidate once, ordered by count desc then text', () => {
    const c = findCandidates('AlphaSvc BetaSvc AlphaSvc BetaSvc AlphaSvc', never)
    expect(c.map((x) => x.text)).toEqual(['AlphaSvc', 'BetaSvc'])
    expect(c[0].count).toBe(3)
  })

  it('never proposes a tech term even when a company marker wraps it', () => {
    const c = findCandidates('(주)Kafka 컨설팅에서 일했다', never)
    expect(c.map((x) => x.text)).not.toContain('Kafka')
  })
})

describe('buildMaskDict', () => {
  it('numbers tokens per kind starting at 1', () => {
    const dict = buildMaskDict([
      { text: '가상상사', kind: 'company', count: 3 },
      { text: 'SettleHub', kind: 'system', count: 2 },
      { text: 'PayGate', kind: 'system', count: 2 },
    ])
    expect(dict).toEqual({
      '가상상사': '[COMPANY_1]',
      'SettleHub': '[SYSTEM_1]',
      'PayGate': '[SYSTEM_2]',
    })
  })
})

describe('applyMask', () => {
  it('replaces every occurrence', () => {
    const dict = { SettleHub: '[SYSTEM_1]' }
    expect(applyMask('SettleHub 는 SettleHub 다', dict)).toBe('[SYSTEM_1] 는 [SYSTEM_1] 다')
  })

  it('is idempotent — masking twice changes nothing more', () => {
    const dict = { SettleHub: '[SYSTEM_1]' }
    const once = applyMask('SettleHub 배치', dict)
    expect(applyMask(once, dict)).toBe(once)
  })

  it('replaces longer keys first so a shorter key cannot corrupt them', () => {
    const dict = { 'Settle': '[SYSTEM_2]', 'SettleHub': '[SYSTEM_1]' }
    expect(applyMask('SettleHub', dict)).toBe('[SYSTEM_1]')
  })

  it('leaves text untouched with an empty dict', () => {
    expect(applyMask('그대로', {})).toBe('그대로')
  })
})
