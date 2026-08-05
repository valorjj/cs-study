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
})
