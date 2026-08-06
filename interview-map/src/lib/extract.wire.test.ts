// extract.test.ts는 supabase를 null로 스텁해 "미설정 환경" 경로만 본다. 이 파일은
// 스펙 §테스트 전략 ②가 가장 가치 있다고 지목한 검사를 한다: 네트워크 호출을
// 스텁하고, 실제로 와이어에 실린 body를 가로채, 확정된 마스킹 사전의 모든 키가
// (원문이든 JSON 이스케이프된 형태든) 그 안 어디에도 없음을 확인한다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

import { prepareExtract, requestExtract } from './extract'
import type { Project } from './resumeTypes'
import type { GraphNode } from '../graph/types'

beforeEach(() => invoke.mockReset())

const nodes: GraphNode[] = [
  { id: 'db-nosql', label: 'SQL vs NoSQL / Redis', domain: 'database', level: 1, icon: '', summary: '',
    keywords: ['Redis'], status: 'todo', position: { x: 0, y: 0 } },
]

// 서술문이 마스킹 대상 용어를 실제로 여러 개, 여러 형태(원문 그대로)로 담고 있는
// 프로젝트. maskDecisions가 이들을 전부 가리기로 결정해야 payload가 나간다.
const project: Project = {
  id: 'p1', name: '정산', period: '2025', role: 'backend',
  stack: ['Redis'], lifecycle: ['tx'],
  narrative: 'SettleHub 배치가 두 번 돌았다. 담당자 kim@internal-corp.example 에게 보고했다.',
  maskDecisions: [
    { text: 'SettleHub', kind: 'system', mask: true },
    { text: 'kim@internal-corp.example', kind: 'contact', mask: true },
  ],
  matches: [], updatedAt: '2026-08-05T00:00:00.000Z',
}
const maskDict = {
  SettleHub: '[SYSTEM_1]',
  'kim@internal-corp.example': '[CONTACT_1]',
}

describe('requestExtract wire body — no confirmed mask key ever reaches the network', () => {
  it('sends a body where none of the dictionary keys survive, raw or JSON-escaped', async () => {
    invoke.mockResolvedValue({ data: { nodeIds: [], reasons: {} }, error: null })
    await requestExtract(project, nodes)

    expect(invoke).toHaveBeenCalledTimes(1)
    const [, opts] = invoke.mock.calls[0] as [string, { body: unknown }]
    const wireBody = JSON.stringify(opts.body)

    for (const plain of Object.keys(maskDict)) {
      expect(wireBody).not.toContain(plain)
      const escaped = JSON.stringify(plain).slice(1, -1)
      expect(wireBody).not.toContain(escaped)
    }
  })

  // requestExtract가 payload를 인자로 받던 구조에서는, 검사를 통과한 값을 스프레드로
  // 덮어써서 검사되지 않은 내용을 보낼 수 있었다. 이제 payload를 직접 만들므로
  // 전송 직전에 검사가 돈다. 이 테스트는 그 이음새가 다시 생기면 깨진다.
  it('never reaches the network when the mask leaves plaintext behind', async () => {
    invoke.mockResolvedValue({ data: { nodeIds: [], reasons: {} }, error: null })
    // 결정이 하나도 없는 상태 — 이메일 후보가 undecided로 남아 게이트가 막는다.
    const broken = { ...project, maskDecisions: [] }
    await expect(requestExtract(broken, nodes)).rejects.toThrow(/전송을 중단/)
    expect(invoke).not.toHaveBeenCalled()
  })

  // 미리보기(prepareExtract)와 전송이 같은 값을 만드는지 — 갈라지면 미리보기는
  // 거짓 안전감만 주는 장식이 된다.
  it('sends exactly what the preview showed', async () => {
    invoke.mockResolvedValue({ data: { nodeIds: [], reasons: {} }, error: null })
    const preview = prepareExtract(project, nodes)
    await requestExtract(project, nodes)
    expect(invoke).toHaveBeenCalledTimes(1)
    const [, opts] = invoke.mock.calls[0] as [string, { body: unknown }]
    expect(opts.body).toEqual(preview)
  })
})
