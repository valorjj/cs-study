import { describe, it, expect } from 'vitest'
import { buildExtractPayload, assertNoPlaintext } from './extractPayload'
import type { Project } from './resumeTypes'
import type { GraphNode } from '../graph/types'

const nodes: GraphNode[] = [
  { id: 'database', label: 'Database', domain: 'database', level: 0, icon: '', summary: '',
    keywords: ['인덱스'], status: 'todo', position: { x: 0, y: 0 } },
  { id: 'db-nosql', label: 'SQL vs NoSQL / Redis', domain: 'database', level: 1, icon: '', summary: '',
    keywords: ['Redis', '캐시'], status: 'todo', position: { x: 0, y: 0 } },
]

const project: Project = {
  id: 'p1', name: '정산', period: '2025.03-2025.11', role: 'sole backend',
  stack: ['Redis'], lifecycle: ['architecture', 'tx'],
  narrative: 'SettleHub 배치가 두 번 돌았다. SettleHub 로그를 봤다.',
  maskDecisions: [{ text: 'SettleHub', kind: 'system', mask: true }],
  matches: [], updatedAt: '2026-08-05T00:00:00.000Z',
}
const maskDict = { SettleHub: '[SYSTEM_1]' }

describe('buildExtractPayload', () => {
  it('sends the masked narrative, never the original', () => {
    const p = buildExtractPayload(project, nodes)
    expect(p.maskedNarrative).toBe('[SYSTEM_1] 배치가 두 번 돌았다. [SYSTEM_1] 로그를 봤다.')
    expect(p.maskedNarrative).not.toContain('SettleHub')
  })

  it('passes stack chips through unmasked — they are tech terms and the main signal', () => {
    expect(buildExtractPayload(project, nodes).stack).toEqual(['Redis'])
  })

  it('carries the lifecycle stages', () => {
    expect(buildExtractPayload(project, nodes).lifecycle).toEqual(['architecture', 'tx'])
  })

  it('includes only concept nodes in the catalog, not level-0 domains', () => {
    const p = buildExtractPayload(project, nodes)
    expect(p.catalog.map((c) => c.id)).toEqual(['db-nosql'])
  })

  it('does not leak project name, period or role — they are not needed for extraction', () => {
    const json = JSON.stringify(buildExtractPayload(project, nodes))
    expect(json).not.toContain('정산')
    expect(json).not.toContain('2025.03')
    expect(json).not.toContain('sole backend')
  })
})

describe('assertNoPlaintext', () => {
  it('passes when every dict key has been masked away', () => {
    const p = buildExtractPayload(project, nodes)
    expect(() => assertNoPlaintext(p, maskDict)).not.toThrow()
  })

  it('throws when any dict key survives anywhere in the payload', () => {
    const p = buildExtractPayload(project, nodes)
    const leaky = { ...p, maskedNarrative: `${p.maskedNarrative} SettleHub` }
    expect(() => assertNoPlaintext(leaky, maskDict)).toThrow(/SettleHub/)
  })

  it('scans the whole serialized payload, not just the narrative field', () => {
    const p = buildExtractPayload(project, nodes)
    const leaky = { ...p, stack: [...p.stack, 'SettleHub'] }
    expect(() => assertNoPlaintext(leaky, maskDict)).toThrow()
  })

  // 대소문자만 다른 잔존도 잡아야 한다 — applyMask가 대소문자 무시로 치환하므로,
  // 검사도 대소문자를 접어 비교하지 않으면 "치환됐다고 믿지만 실제로는 다른
  // 대소문자로 남아 있는" 상태를 조용히 통과시킨다.
  it('catches a residual occurrence that differs only in case', () => {
    const p = buildExtractPayload(project, nodes)
    const leaky = { ...p, maskedNarrative: `${p.maskedNarrative} settlehub` }
    expect(() => assertNoPlaintext(leaky, maskDict)).toThrow(/settlehub/i)
  })

  it('ignores an empty dict', () => {
    // mask:false 도 결정이다 — 후보를 안 가리기로 결정했으니 게이트는 통과하고
    // 파생 사전은 비어 있다.
    const p = buildExtractPayload(
      { ...project, maskDecisions: [{ text: 'SettleHub', kind: 'system', mask: false }] }, nodes,
    )
    expect(() => assertNoPlaintext(p, {})).not.toThrow()
  })

  it('catches a leaked key containing a backslash, which JSON escapes', () => {
    const dict = { 'back\\slash': '[SYSTEM_9]' }
    const p = buildExtractPayload({ ...project, narrative: 'x', maskDecisions: [] }, nodes)
    const leaky = { ...p, maskedNarrative: 'prefix back\\slash suffix' }
    expect(() => assertNoPlaintext(leaky, dict)).toThrow()
  })

  it('catches a leaked key containing a double quote', () => {
    const dict = { 'he"llo': '[SYSTEM_9]' }
    const p = buildExtractPayload({ ...project, narrative: 'x', maskDecisions: [] }, nodes)
    const leaky = { ...p, maskedNarrative: 'said he"llo once' }
    expect(() => assertNoPlaintext(leaky, dict)).toThrow()
  })

  it('catches a leaked key containing a newline', () => {
    const dict = { 'two\nlines': '[SYSTEM_9]' }
    const p = buildExtractPayload({ ...project, narrative: 'x', maskDecisions: [] }, nodes)
    const leaky = { ...p, maskedNarrative: 'has two\nlines inside' }
    expect(() => assertNoPlaintext(leaky, dict)).toThrow()
  })

  it('skips an empty-string key instead of throwing on everything', () => {
    const p = buildExtractPayload(
      { ...project, maskDecisions: [{ text: 'SettleHub', kind: 'system', mask: false }] }, nodes,
    )
    expect(() => assertNoPlaintext(p, { '': '[X]' })).not.toThrow()
  })

  it('names the stack chip field when a masked key collides with a chip', () => {
    const p = buildExtractPayload(project, nodes)
    const leaky = { ...p, stack: [...p.stack, 'SettleHub'] }
    expect(() => assertNoPlaintext(leaky, maskDict)).toThrow(/기술스택 칩/)
  })

  it('names the narrative field when a masked key survives there', () => {
    const p = buildExtractPayload(project, nodes)
    const leaky = { ...p, maskedNarrative: `${p.maskedNarrative} SettleHub` }
    expect(() => assertNoPlaintext(leaky, maskDict)).toThrow(/서술문/)
  })
})

describe('buildExtractPayload mask gate', () => {
  it('refuses to build when a candidate has no decision', () => {
    const p: Project = { ...project, narrative: '(주)정산 에서 일했다', maskDecisions: [] }
    expect(() => buildExtractPayload(p, nodes)).toThrow(/결정되지 않은/)
  })

  it('builds once every candidate is decided', () => {
    const p: Project = {
      ...project,
      narrative: '(주)정산 에서 일했다',
      maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    }
    expect(buildExtractPayload(p, nodes).maskedNarrative).toContain('[COMPANY_1]')
  })

  // 게이트를 통과하고도 assertNoPlaintext가 실제로 배선되어 있어야만 잡히는 경우.
  // 'COMPANY_1'은 (주) 마커가 없고 CODENAME_RE도 밑줄 뒤라 경계가 안 생겨 후보로
  // 탐지되지 않으므로 게이트는 통과한다. 하지만 치환 토큰 '[COMPANY_1]'이 원문
  // 'COMPANY_1'을 그대로 포함하므로, assertNoPlaintext가 없으면 이 상태가 그대로
  // 나간다. buildExtractPayload에서 그 호출을 지워도 이 테스트만은 실패해야 한다.
  it('still catches residual plaintext after the gate passes', () => {
    const p: Project = {
      ...project,
      narrative: 'COMPANY_1 시스템을 썼다',
      maskDecisions: [{ text: 'COMPANY_1', kind: 'company', mask: true }],
    }
    expect(() => buildExtractPayload(p, nodes)).toThrow(/마스킹되지 않은 원문이 남아 있어/)
  })
})
