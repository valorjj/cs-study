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
  maskDecisions: [{ text: 'SettleHub', kind: 'system', mask: true }],
  matches: [], updatedAt: '2026-08-05T00:00:00.000Z',
}

describe('prepareExtract', () => {
  it('returns a payload whose narrative is masked', () => {
    expect(prepareExtract(project, nodes).maskedNarrative).toBe('[SYSTEM_1] 배치가 두 번 돌았다')
  })

  it('throws instead of returning a payload that still holds plaintext', () => {
    // maskDecisions가 후보를 하나도 결정하지 못한 상태(=게이트가 막아야 하는 상태)를
    // 만든다. maskDict가 삭제되어 "사전 키와 서술문이 어긋난 상태"를 직접 만들 수는
    // 없다 — 사전은 이제 결정에서만 파생되므로, 대신 결정이 비어 있는 상태로 같은
    // 결과(빌드 거부)를 낸다.
    const broken: Project = { ...project, narrative: '(주)정산 에서 일했다', maskDecisions: [] }
    expect(() => prepareExtract(broken, nodes)).toThrow(/전송을 중단/)
  })

  it('exposes exactly the four documented fields and nothing else', () => {
    const p = prepareExtract(project, nodes)
    expect(Object.keys(p).sort()).toEqual(['catalog', 'lifecycle', 'maskedNarrative', 'stack'])
    expect(Object.getOwnPropertySymbols(p)).toEqual([])
  })
})

describe('requestExtract without Supabase configured (test env)', () => {
  it('reports unauthenticated instead of throwing', async () => {
    await expect(requestExtract(project, nodes)).resolves.toEqual({ ok: false, reason: 'unauthenticated' })
  })

  // 마스킹 실패가 "로그인 필요"로 둔갑하면 사용자는 로그인만 반복하고 진짜 원인을
  // 못 본다. 평문 검사가 supabase 유무 확인보다 앞에 있어야 한다.
  it('surfaces a broken mask even when Supabase is not configured', async () => {
    const broken: Project = { ...project, narrative: '(주)정산 에서 일했다', maskDecisions: [] }
    await expect(requestExtract(broken, nodes)).rejects.toThrow(/전송을 중단/)
  })
})

describe('buildExtractPayload mask gate', () => {
  // 게이트가 UI 예절이 아니라 경로의 일부라는 것. requestExtract는 payload를 받지
  // 않고 직접 만들므로(직전 플랜), 게이트를 우회할 수 있는 호출자가 없다.
  it('is enforced on the wire path too', async () => {
    const p: Project = { ...project, narrative: '(주)정산 에서 일했다', maskDecisions: [] }
    await expect(requestExtract(p, nodes)).rejects.toThrow(/결정되지 않은/)
  })
})
