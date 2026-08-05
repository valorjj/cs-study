import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MaskPanel } from './MaskPanel'
import { useResumeStore } from '../store/resumeStore'
import { buildExtractPayload } from '../lib/extractPayload'
import { deriveKey, randomSalt, toB64 } from '../lib/vault'
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
    // 미리보기가 "정산"이 가려졌다고 주장하면 안 된다 — 이 상태에서는 게이트가 항상
    // 막혀 있어(결정이 store에 반영되지 않았으므로) 미리보기 자체가 없어야 한다.
    // (이전 버전은 `if (preview) expect(...)`였는데, 이 분기가 항상 참이라 preview는
    // 항상 null이고 안의 expect는 결코 실행되지 않았다 — 실패할 수 없는 위장 단정이었다.)
    expect(screen.queryByTestId('mask-preview')).toBeNull()
  })

  // review round 2 finding 1: 두 결정을 첫 쓰기가 끝나기 전에 연달아 클릭하면, 각
  // persist 호출이 "자신을 만든 렌더의 project prop"이 아니라 store에서 직접 최신
  // 프로젝트를 읽어야 서로의 결정을 덮어쓰지 않는다. 렌더 클로저의 project를 base로
  // 삼으면 둘 다 같은(결정이 아직 없는) 예전 배열을 기준으로 next를 계산해 나중에
  // 쓰는 쪽이 먼저 쓴 쪽을 지운다.
  it('does not lose either decision when two are dispatched back-to-back', async () => {
    const twoCompanies: Project = {
      ...project, narrative: '(주)가가 와 (주)나나 에서 일했다', maskDecisions: [],
    }
    useResumeStore.setState({ projects: [twoCompanies] })
    render(<MaskPanel project={twoCompanies} nodes={nodes} />)

    // 첫 클릭의 비동기 저장이 끝나길 기다리지 않고 바로 두 번째를 클릭한다.
    fireEvent.click(screen.getByRole('button', { name: '가가 가리기' }))
    fireEvent.click(screen.getByRole('button', { name: '나나 가리기' }))

    await waitFor(() => {
      const decisions = useResumeStore.getState().projects[0].maskDecisions
      expect(decisions).toHaveLength(2)
    })
    const decisions = useResumeStore.getState().projects[0].maskDecisions
    expect(decisions.find((d) => d.text === '가가')).toEqual({ text: '가가', kind: 'company', mask: true })
    expect(decisions.find((d) => d.text === '나나')).toEqual({ text: '나나', kind: 'company', mask: true })
    // 둘 다 실제로 반영됐으니 실패 메시지가 남아 있으면 안 된다.
    expect(screen.queryByText(/저장하지 못했|삭제되어/)).toBeNull()
  })

  // review round 3 finding 1의 세 번째 부분: writeError는 그 실패를 낳은 text에 묶여
  // 있어야 한다. A가 실패해 메시지가 뜬 뒤 관계없는 B가 성공해도, A의 메시지가
  // 지워지면 안 된다 — 사용자는 A가 반영되지 않았다는 사실을 계속 알아야 한다.
  it('keeps candidate A\'s failure message visible after a different candidate B succeeds', async () => {
    const twoCompanies: Project = {
      ...project, narrative: '(주)가가 와 (주)나나 에서 일했다', maskDecisions: [],
    }
    useResumeStore.setState({ status: 'locked', projects: [twoCompanies], error: null })
    render(<MaskPanel project={twoCompanies} nodes={nodes} />)

    fireEvent.click(screen.getByRole('button', { name: '가가 가리기' }))
    await waitFor(() => expect(screen.getByText(/저장하지 못했|잠겨 있어/)).toBeTruthy())
    expect(useResumeStore.getState().projects[0].maskDecisions
      .find((d) => d.text === '가가')).toBeUndefined()

    // 금고를 unlocked로 돌려 이번엔 실제로 저장되게 한다 — 나나는 가가와 무관한 결정이다.
    act(() => { useResumeStore.setState({ status: 'unlocked' }) })
    fireEvent.click(screen.getByRole('button', { name: '나나 가리기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions
        .find((d) => d.text === '나나')).toEqual({ text: '나나', kind: 'company', mask: true }))

    // 나나가 성공했다고 가가의 실패 메시지가 지워지면 안 된다 — 가가는 여전히 store에
    // 반영되지 않은 채다.
    expect(screen.getByText(/저장하지 못했|잠겨 있어/)).toBeTruthy()
    expect(useResumeStore.getState().projects[0].maskDecisions
      .find((d) => d.text === '가가')).toBeUndefined()
  })

  // 거울상 케이스: A가 실패한 뒤 같은 A를 다시 시도해 성공하면, 이번엔 그 메시지가
  // 지워져야 한다(더 이상 유효하지 않은 실패 기록을 화면에 남겨두면 안 된다).
  it('clears the failure message once the same candidate is retried and succeeds', async () => {
    useResumeStore.setState({ status: 'locked', projects: [project], error: null })
    render(<MaskPanel project={project} nodes={nodes} />)

    fireEvent.click(screen.getByRole('button', { name: '정산 가리기' }))
    await waitFor(() => expect(screen.getByText(/저장하지 못했|잠겨 있어/)).toBeTruthy())

    act(() => { useResumeStore.setState({ status: 'unlocked' }) })
    fireEvent.click(screen.getByRole('button', { name: '정산 가리기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions)
        .toEqual([{ text: '정산', kind: 'company', mask: true }]))
    expect(screen.queryByText(/저장하지 못했|잠겨 있어/)).toBeNull()
  })

  // 저장 데이터에 같은 text의 결정이 이미 중복으로 들어 있을 수 있다(가져오기 등).
  // persist의 필터(같은 text는 덮어쓴다)가 이런 기존 중복도 정리해야, 결정 목록의
  // React key(`d.text`)가 충돌하지 않고 dictOf의 종류별 순번도 어긋나지 않는다. 이
  // 필터는 "같은 후보를 두 번 클릭"해서는 도달할 수 없다 — 이미 결정된 후보는
  // undecided 목록에서 사라져 버튼 자체가 없어지기 때문이다. 그래서 저장된 데이터에
  // 중복을 직접 심어야 이 경로를 태울 수 있다.
  it('collapses a pre-existing duplicate decision for the same text', async () => {
    const dup: Project = {
      ...project,
      maskDecisions: [
        { text: '정산', kind: 'company', mask: true },
        { text: '정산', kind: 'company', mask: false },
      ],
    }
    useResumeStore.setState({ projects: [dup] })
    render(<MaskPanel project={dup} nodes={nodes} />)

    const undoButtons = screen.getAllByRole('button', { name: '되돌리기' })
    expect(undoButtons).toHaveLength(2)   // 중복이 실제로 두 항목으로 렌더됐다는 전제
    fireEvent.click(undoButtons[0])

    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions).toEqual([]))
  })

  // Task 5b: the earlier "locked vault" failure tests above only exercise the
  // status-guard rejection — upsertProject refuses before ever calling persist(), so it
  // never proves MaskPanel can see a real disk-write failure. This test uses a genuine
  // CryptoKey and makes localStorage.setItem throw, so persist() actually runs and its
  // write fails. If MaskPanel fell back to checking "does the decision exist in
  // store.projects" (as it used to), this would wrongly read as success, because the
  // design decision (brief Step 3) is to keep the decision in memory even when the disk
  // write fails — landed-in-memory and landed-on-disk are deliberately different things
  // now, and only the return value distinguishes them.
  it('shows a disk-write failure via writeError even though the decision still lands in memory', async () => {
    const salt = randomSalt()
    const key = await deriveKey('pw', salt)
    useResumeStore.setState({ status: 'unlocked', projects: [project], error: null, key, salt: toB64(salt) })
    render(<MaskPanel project={project} nodes={nodes} />)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    fireEvent.click(screen.getByRole('button', { name: '정산 가리기' }))
    await waitFor(() => expect(screen.getByText(/저장하지 못했|저장 공간/)).toBeTruthy())
    spy.mockRestore()
    // 설계 판단: 메모리는 유지한다 — 디스크 실패에도 결정 자체는 store.projects에
    // 반영되어 있어야 한다(사용자가 클릭한 결과가 사라지면 안 된다).
    expect(useResumeStore.getState().projects[0].maskDecisions)
      .toEqual([{ text: '정산', kind: 'company', mask: true }])
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
