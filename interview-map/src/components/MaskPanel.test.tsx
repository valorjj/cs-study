import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MaskPanel } from './MaskPanel'
import { useResumeStore } from '../store/resumeStore'
import { buildExtractPayload } from '../lib/extractPayload'
import type { Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'

// HashMap을 keyword로 가진 노드 하나 — never-mask 판정을 실제로 태운다. 'Redis'는
// CODENAME_RE(카멜케이스 2세그먼트 또는 3자+ ALLCAPS)에 애초에 매치되지 않아 이
// 서술문에서는 neverMask가 있든 없든 후보가 되지 않는다(직접 findCandidates로 확인함
// — round 1 보고서 참조). 'HashMap'은 카멜케이스 2세그먼트("Hash"+"Map")라 실제로
// CODENAME_RE에 걸리고, 서술문에 2회 이상 등장해 코드명 후보 규칙(count>=2)도
// 만족한다 — neverMask가 실제로 이 후보를 걸러내는지를 검증할 수 있다.
const nodes: GraphNode[] = [
  { id: 'java-hashmap', label: 'HashMap', domain: 'java', level: 2, icon: '', summary: '',
    keywords: ['HashMap', '해시', 'treeify'], status: 'todo', position: { x: 0, y: 0 } },
]

const project: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: 'p', period: '', role: '',
  stack: [], lifecycle: [],
  narrative: '(주)정산 에서 HashMap 내부 구현을 커스터마이징했다. HashMap 트리화도 직접 확인했다.',
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
    // HashMap이 후보로 뜨면 사용자가 그것을 가릴 수 있고, 가리면 추출 신호가 사라진다.
    // (neverMask를 빼면 실제로 후보에 뜬다 — round 1 보고서의 뮤테이션 검증 참조.)
    expect(screen.queryByText('HashMap')).toBeNull()
  })

  it('records a mask decision and a keep decision distinctly', async () => {
    const first = render(<MaskPanel project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '정산 가리기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions)
        .toEqual([{ text: '정산', kind: 'company', mask: true }]))
    // 첫 인스턴스를 명시적으로 unmount한다 — RTL은 테스트 "사이"에만 auto-cleanup하고,
    // 같은 테스트 안에서 render()를 두 번 부르면 이전 DOM이 그대로 남아 아래 두 번째
    // getByRole이 두 인스턴스분의 버튼을 동시에 찾아 모호해진다.
    first.unmount()

    useResumeStore.setState({ projects: [project] })
    render(<MaskPanel project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '정산 남기기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions[0].mask).toBe(false))
  })

  // 이 화면이 존재하는 유일한 이유를 지키는 테스트다: 저장이 거부되면(예: 저장 도중
  // 금고가 잠김) 패널은 결정이 반영된 것처럼 보여주면 안 된다. store엔 결정이 없는데
  // 패널이 마스킹된 미리보기를 보여주면, Task 8의 전송 경로는 store에서 새로 payload를
  // 만들기 때문에 사용자가 본 미리보기와 실제로 나가는 내용이 갈라진다.
  it('shows a failed persist as a visible failure, never as if it were masked', async () => {
    useResumeStore.setState({ status: 'locked', projects: [project], error: null })
    render(<MaskPanel project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '정산 가리기' }))

    await waitFor(() => expect(screen.getByText(/저장하지 못했|잠겨 있어/)).toBeTruthy())
    // store에는 결정이 반영되지 않았어야 한다 — upsertProject가 잠긴 금고에서 조용히
    // 거부했으므로.
    expect(useResumeStore.getState().projects[0].maskDecisions).toEqual([])
    // 미리보기가 "정산"이 가려졌다고 주장하면 안 된다 — 실제로 전송될 payload는
    // (store 기준으로) 여전히 마스킹되지 않은 상태다.
    const preview = screen.queryByTestId('mask-preview')
    if (preview) expect(preview.textContent).not.toContain('[COMPANY_1]')
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
    expect(shown).toContain('HashMap')     // 기술 용어는 그대로 나간다
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
