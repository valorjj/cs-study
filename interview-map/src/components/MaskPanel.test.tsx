import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MaskPanel } from './MaskPanel'
import { useResumeStore } from '../store/resumeStore'
import { buildExtractPayload } from '../lib/extractPayload'
import type { Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'

// Redis를 keyword로 가진 노드 하나 — never-mask 판정을 실제로 태운다.
const nodes: GraphNode[] = [
  { id: 'db-nosql', label: 'SQL vs NoSQL / Redis', domain: 'database', level: 1, icon: '', summary: '',
    keywords: ['Redis', '캐시'], status: 'todo', position: { x: 0, y: 0 } },
]

const project: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: 'p', period: '', role: '',
  stack: [], lifecycle: [],
  narrative: '(주)정산 에서 Redis 캐시를 붙였다',
  maskDecisions: [], matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
}

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState({ status: 'unlocked', projects: [project], error: null })
})

describe('MaskPanel', () => {
  it('lists the undecided candidate but not a technical term', () => {
    render(<MaskPanel project={project} nodes={nodes} />)
    expect(screen.getByText('정산')).toBeTruthy()
    // Redis가 후보로 뜨면 사용자가 그것을 가릴 수 있고, 가리면 추출 신호가 사라진다.
    expect(screen.queryByText('Redis')).toBeNull()
  })

  it('records a mask decision and a keep decision distinctly', async () => {
    render(<MaskPanel project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '정산 가리기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions)
        .toEqual([{ text: '정산', kind: 'company', mask: true }]))

    useResumeStore.setState({ projects: [project] })
    render(<MaskPanel project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '정산 남기기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions[0].mask).toBe(false))
  })

  // 미리보기는 buildExtractPayload의 결과를 그대로 렌더한다. 별도 조립을 하면
  // 언젠가 둘이 갈라지고, 그때 미리보기는 거짓 안전감만 주는 장식이 된다.
  it('shows the exact text that would be sent', () => {
    const decided: Project = {
      ...project, maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    }
    render(<MaskPanel project={decided} nodes={nodes} />)
    const shown = screen.getByTestId('mask-preview').textContent ?? ''
    expect(shown).toBe(buildExtractPayload(decided, nodes).maskedNarrative)
    expect(shown).toContain('[COMPANY_1]')
    expect(shown).toContain('Redis')     // 기술 용어는 그대로 나간다
  })

  it('shows why the preview is unavailable while a candidate is undecided', () => {
    render(<MaskPanel project={project} nodes={nodes} />)
    expect(screen.queryByTestId('mask-preview')).toBeNull()
    expect(screen.getByText(/결정되지 않은/)).toBeTruthy()
  })

  it('never renders the raw masked term once it is masked', () => {
    const decided: Project = {
      ...project, maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    }
    const { container } = render(<MaskPanel project={decided} nodes={nodes} />)
    // 미리보기 안에 원문이 남아 있으면 마스킹이 새는 것이다. 결정 목록에는
    // 원문이 보여야 하므로(사용자가 무엇을 가렸는지 알아야 한다) 미리보기만 본다.
    expect(screen.getByTestId('mask-preview').textContent).not.toContain('정산')
    expect(container.textContent).toContain('정산')   // 결정 목록에는 있다
  })
})
