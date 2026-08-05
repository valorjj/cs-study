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
  maskDict: { SettleHub: '[SYSTEM_1]' },
  matches: [], updatedAt: '2026-08-05T00:00:00.000Z',
}

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
    expect(() => assertNoPlaintext(p, project.maskDict)).not.toThrow()
  })

  it('throws when any dict key survives anywhere in the payload', () => {
    const p = buildExtractPayload(project, nodes)
    const leaky = { ...p, maskedNarrative: `${p.maskedNarrative} SettleHub` }
    expect(() => assertNoPlaintext(leaky, project.maskDict)).toThrow(/SettleHub/)
  })

  it('scans the whole serialized payload, not just the narrative field', () => {
    const p = buildExtractPayload(project, nodes)
    const leaky = { ...p, stack: [...p.stack, 'SettleHub'] }
    expect(() => assertNoPlaintext(leaky, project.maskDict)).toThrow()
  })

  it('ignores an empty dict', () => {
    const p = buildExtractPayload({ ...project, maskDict: {} }, nodes)
    expect(() => assertNoPlaintext(p, {})).not.toThrow()
  })
})
