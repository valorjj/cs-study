import { describe, it, expect, vi } from 'vitest'

// Mock supabase as null to simulate test environment where env vars are missing
vi.mock('./supabase', () => ({ supabase: null }))

import { prepareExtract, requestExtract } from './extract'
import type { Project } from './resumeTypes'
import type { GraphNode } from '../graph/types'

const nodes: GraphNode[] = [
  { id: 'db-nosql', label: 'SQL vs NoSQL / Redis', domain: 'database', level: 1, icon: '', summary: '',
    keywords: ['Redis'], status: 'todo', position: { x: 0, y: 0 } },
]

const project: Project = {
  id: 'p1', name: '정산', period: '2025', role: 'backend',
  stack: ['Redis'], lifecycle: ['tx'],
  narrative: 'SettleHub 배치가 두 번 돌았다',
  maskDict: { SettleHub: '[SYSTEM_1]' },
  matches: [], updatedAt: '2026-08-05T00:00:00.000Z',
}

describe('prepareExtract', () => {
  it('returns a payload whose narrative is masked', () => {
    expect(prepareExtract(project, nodes).maskedNarrative).toBe('[SYSTEM_1] 배치가 두 번 돌았다')
  })

  it('throws instead of returning a payload that still holds plaintext', () => {
    // maskDict가 원문을 가리지 못하는 상태(사전 키와 서술문이 어긋남)를 만든다.
    const broken: Project = { ...project, maskDict: { 'SettleHub': 'SettleHub' } }
    expect(() => prepareExtract(broken, nodes)).toThrow(/전송을 중단/)
  })

  it('exposes exactly the four documented fields as own enumerable keys (the brand symbol is not one)', () => {
    const p = prepareExtract(project, nodes)
    expect(Object.keys(p).sort()).toEqual(['catalog', 'lifecycle', 'maskedNarrative', 'stack'])
  })
})

describe('requestExtract without Supabase configured (test env)', () => {
  it('reports unauthenticated instead of throwing', async () => {
    const p = prepareExtract(project, nodes)
    await expect(requestExtract(p)).resolves.toEqual({ ok: false, reason: 'unauthenticated' })
  })
})
