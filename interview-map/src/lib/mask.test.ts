import { describe, it, expect } from 'vitest'
import { buildNeverMask, findCandidates, buildMaskDict, applyMask, maskGate, dictOf } from './mask'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'
import type { MaskDecision } from './resumeTypes'

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

  // review round 4 finding 3d: 마스킹 키에 정규식 메타문자가 들어간 케이스가 어디에서도
  // 검증되지 않았다. 그 캐리어는 contact 종류다 — 이메일에는 `.`과 `+`가 흔하다. escapeRe가
  // 사라지면(또는 새 치환 경로가 그걸 잊으면) `.`은 임의 문자, `v+`는 반복이 되어 전혀 다른
  // 문자열까지 함께 가려진다. 실패해도 안전한 쪽으로 무너지지만(전송 게이트가 다시 막는다),
  // 사용자에게는 가장 흔한 후보 종류에서 영구히 설명 불가능한 전송 차단으로 보인다.
  it('escapes regex metacharacters in a contact key, masking it and nothing else', () => {
    const dict = { 'kim.dev+ops@corp.example.com': '[CONTACT_1]' }
    // 두 번째 주소는 첫 키를 정규식으로 그대로 쓰면(`.`=임의 문자, `v+`=v 반복) 함께
    // 걸려버리는 문자열이다 — 이스케이프가 실제로 돌고 있어야 그대로 남는다.
    const text = '문의는 kim.dev+ops@corp.example.com 로. 무관한 kimXdevops@corpXexampleXcom 는 그대로.'
    expect(applyMask(text, dict))
      .toBe('문의는 [CONTACT_1] 로. 무관한 kimXdevops@corpXexampleXcom 는 그대로.')
  })

  it('leaves text untouched with an empty dict', () => {
    expect(applyMask('그대로', {})).toBe('그대로')
  })

  // 같은 실체가 서술문에 다른 대소문자로 적혀 있어도(URL·호스트명·소문자 산문 등)
  // 같은 결정이 적용돼야 한다 — neverMask 쪽도 이미 normalize()로 대소문자를 접는다.
  it('replaces a case-variant occurrence, not only the exact case decided', () => {
    const dict = { SettleHub: '[SYSTEM_1]' }
    const text = 'SettleHub 배치. SettleHub 로그. settlehub 대시보드.'
    expect(applyMask(text, dict)).toBe('[SYSTEM_1] 배치. [SYSTEM_1] 로그. [SYSTEM_1] 대시보드.')
  })
})

describe('maskGate', () => {
  const neverMask = new Set<string>(['redis'])

  it('is ready when there are no candidates at all', () => {
    expect(maskGate('평범한 문장입니다', [], neverMask)).toEqual({ ready: true, undecided: [] })
  })

  it('is NOT ready when a candidate has no decision', () => {
    const g = maskGate('(주)정산 에서 일했다', [], neverMask)
    expect(g.ready).toBe(false)
    expect(g.undecided.map((c) => c.text)).toEqual(['정산'])
  })

  // "가리지 않는다"도 결정이다. 결정을 내렸으면 통과해야 한다 — 아니면 사용자가
  // 남기고 싶은 단어 하나 때문에 기능 전체가 영구히 막힌다.
  it('is ready when every candidate is decided, including mask:false', () => {
    const d: MaskDecision[] = [{ text: '정산', kind: 'company', mask: false }]
    expect(maskGate('(주)정산 에서 일했다', d, neverMask).ready).toBe(true)
  })

  // 서술문을 고쳐 새 후보가 생기면 다시 막혀야 한다. 이게 사전을 저장하지 않는 이유다.
  it('blocks again when an edit introduces a new candidate', () => {
    const d: MaskDecision[] = [{ text: '정산', kind: 'company', mask: true }]
    const g = maskGate('(주)정산 과 (주)물류 에서 일했다', d, neverMask)
    expect(g.ready).toBe(false)
    expect(g.undecided.map((c) => c.text)).toEqual(['물류'])
  })

  it('ignores stale decisions for text no longer in the narrative', () => {
    const d: MaskDecision[] = [{ text: '옛회사', kind: 'company', mask: true }]
    expect(maskGate('평범한 문장입니다', d, neverMask).ready).toBe(true)
  })
})

describe('dictOf', () => {
  it('includes only the decisions marked mask', () => {
    expect(dictOf([
      { text: 'SettleHub', kind: 'system', mask: true },
      { text: 'Redis', kind: 'system', mask: false },
    ])).toEqual({ SettleHub: '[SYSTEM_1]' })
  })

  it('numbers per kind in decision order, deterministically', () => {
    const d: MaskDecision[] = [
      { text: 'A', kind: 'company', mask: true },
      { text: 'B', kind: 'system', mask: true },
      { text: 'C', kind: 'company', mask: true },
    ]
    expect(dictOf(d)).toEqual({ A: '[COMPANY_1]', B: '[SYSTEM_1]', C: '[COMPANY_2]' })
  })

  it('drops a decision whose text is empty or whitespace-only', () => {
    // 빈 키가 사전에 들어가면 new RegExp('', 'gi')가 모든 위치에 매치되어 서술문을
    // 통째로 토큰으로 채워버린다. assertNoPlaintext는 빈 키를 일부러 건너뛰므로
    // 그 결과를 잡아내지도 못한다 — 그래서 사전을 만드는 시점(dictOf)에서 막는다.
    const d: MaskDecision[] = [
      { text: '정산', kind: 'company', mask: true },
      { text: '', kind: 'company', mask: true },
      { text: '   ', kind: 'company', mask: true },
    ]
    expect(dictOf(d)).toEqual({ 정산: '[COMPANY_1]' })
  })
})
