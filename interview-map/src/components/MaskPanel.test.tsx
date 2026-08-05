import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MaskPanel } from './MaskPanel'
import { useResumeStore } from '../store/resumeStore'
import { buildExtractPayload } from '../lib/extractPayload'
import { deriveKey, randomSalt, toB64 } from '../lib/vault'
import { STAGE_LABELS } from '../lib/resumeTypes'
import type { Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'

// requestExtract만 스텁한다 — 전송 본문의 안전성(마스크 딕셔너리 키가 body에 안 실리는지
// 등)은 extract.wire.test.ts가 이미 검증한다. 여기서 다시 그 경계를 테스트하면 같은
// 보장을 중복 확인하는 셈이라, 이 파일에서는 추출 결과 처리 로직만 본다.
vi.mock('../lib/extract', () => ({ requestExtract: vi.fn(), prepareExtract: vi.fn() }))
import { requestExtract } from '../lib/extract'
import type { ExtractOutcome } from '../lib/extract'
const mockExtract = vi.mocked(requestExtract)

// HashMap을 keyword로 가진 노드 하나 — never-mask 판정을 실제로 태운다. 'Redis'는
// CODENAME_RE(카멜케이스 2세그먼트 또는 3자+ ALLCAPS)에 애초에 매치되지 않아 이
// 서술문에서는 neverMask가 있든 없든 후보가 되지 않는다(직접 findCandidates로 확인함
// — round 1 보고서 참조). 'HashMap'은 카멜케이스 2세그먼트("Hash"+"Map")라 실제로
// CODENAME_RE에 걸리고, 서술문에 2회 이상 등장해 코드명 후보 규칙(count>=2)도
// 만족한다 — neverMask가 실제로 이 후보를 걸러내는지를 검증할 수 있다.
//
// db-isolation은 AI 추출 테스트가 mergeLlm에 넘기는 nodeIds가 실재 개념 노드로
// 살아남는지 보기 위해 추가했다(level!==0이어야 concept 집합에 들어간다 —
// conceptMatch.ts의 mergeLlm 참조).
const nodes: GraphNode[] = [
  { id: 'java-hashmap', label: 'HashMap', domain: 'java', level: 2, icon: '', summary: '',
    keywords: ['HashMap', '해시', 'treeify'], status: 'todo', position: { x: 0, y: 0 } },
  { id: 'db-isolation', label: '격리 수준', domain: 'database', level: 2, icon: '', summary: '',
    keywords: ['isolation', '격리'], status: 'todo', position: { x: 0, y: 0 } },
]

const project: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: 'p', period: '', role: '',
  stack: [], lifecycle: [],
  narrative: '(주)정산 에서 HashMap 내부 구현을 커스터마이징했다. HashMap 트리화도 직접 확인했다.',
  maskDecisions: [], matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
}

// review round 1 finding 8: 이 fixture는 원래 key/salt를 전혀 세팅하지 않았다. persist()의
// 키 없음 분기가 (round 0 구현에서) `{ ok: true }`를 돌려주던 시절에는 그게 "성공"처럼
// 보였지만, 그 분기가 이제 정직하게 ok:false(reason:'locked')를 돌려주면서 "B 성공"·"재시도
// 성공"을 검증하는 두 테스트가 실은 아무것도 암호화·저장한 적 없는 키 없음 shortcut에
// 의존하고 있었다는 게 드러났다(mutation으로 확인: persist()의 keyless 분기를 ok:false로
// 고치자 그 테스트들이 즉시 죽었다). 전역으로 진짜 CryptoKey를 주입해 "성공"이라고 주장하는
// 모든 경로가 실제로 암호화·저장까지 간다.
beforeEach(async () => {
  localStorage.clear()
  const salt = randomSalt()
  const key = await deriveKey('pw', salt)
  useResumeStore.setState({
    ...useResumeStore.getInitialState(),
    status: 'unlocked', projects: [project], error: null, key, salt: toB64(salt),
  })
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
    // review round 2 new important 2: store.projects의 maskDecisions는 upsertProject 안에서
    // persist()보다 먼저 동기로 갱신되지만, 이 컴포넌트의 writeError 클리어는 그 upsertProject
    // 호출 전체(진짜 CryptoKey로 실제 encrypt까지 끝나는)가 resolve된 *뒤에만* 일어난다. 진짜
    // 키가 없던(keyless shortcut) round 1 이전에는 그 둘이 같은 microtask 안에서 거의 동시에
    // 일어나 이 간극이 보이지 않았지만, 실제 AES-GCM 왕복이 들어간 지금은 maskDecisions가
    // writeError보다 먼저 반영될 수 있는 진짜 창이 생겼다 — 그 순서로 기다리면(먼저 maskDecisions,
    // 그다음 곧바로 동기 DOM 확인) 아직 writeError가 안 지워진 순간을 잡아 가끔 죽는다(실제로
    // 재현함 — crypto.subtle.encrypt 앞에 인위적 지연을 넣어 결정론적으로 죽는 것을 확인, 아래
    // "Fix Round 2" 보고서 참조). 우리가 실제로 원하는 신호(메시지가 지워졌다 = 쓰기가 완전히
    // 끝났다)를 먼저 기다리면, 그 시점엔 maskDecisions도 이미 반영되어 있다고 믿을 수 있다 —
    // 인과관계가 반대 방향(메시지 클리어가 언제나 maskDecisions 갱신보다 나중)이기 때문이다.
    await waitFor(() => expect(screen.queryByText(/저장하지 못했|잠겨 있어/)).toBeNull())
    expect(useResumeStore.getState().projects[0].maskDecisions)
      .toEqual([{ text: '정산', kind: 'company', mask: true }])
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

  // review round 4 finding 2: 이 화면은 "전송 전문 미리보기"이고 mask.ts는 실제 안전
  // 보증을 여기에 걸고 있다. 그런데 stack·lifecycle은 마스킹 없이 원문 그대로 전송된다 —
  // 개수만 보여주면("기술스택 2개") 사용자는 기기를 떠난 문자열을 끝까지 보지 못한 채
  // 미리보기를 승인한다. 실제 값이 화면에 있어야 한다.
  it('shows the actual stack and lifecycle values that go over the wire, not just counts', () => {
    const decided: Project = {
      ...project,
      stack: ['SettleHub-정산', 'Redis'],
      lifecycle: ['tx'],
      maskDecisions: [{ text: '정산', kind: 'company', mask: false }],
    }
    render(<MaskPanel project={decided} nodes={nodes} />)
    const payload = buildExtractPayload(decided, nodes)
    expect(payload.stack).toEqual(['SettleHub-정산', 'Redis'])   // 전제: 실제로 전송된다

    const preview = screen.getByTestId('mask-preview').closest('details')!
    // 개수가 아니라 값 그대로 — 이 문자열이 곧 기기를 떠나는 문자열이다.
    expect(preview.textContent).toContain('SettleHub-정산')
    expect(preview.textContent).toContain('Redis')
    // 단계는 UI 다른 곳과 같은 한국어 라벨로 읽혀야 한다('tx'가 아니라).
    expect(preview.textContent).toContain(STAGE_LABELS.tx)
    expect(preview.textContent).not.toContain('기술스택 2개')
    // 마스킹하지 않고 보낸다는 사실 자체를 화면이 말해준다.
    expect(preview.textContent).toMatch(/마스킹하지 않고/)
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

describe('AI 개념 추출', () => {
  // 마스킹이 이미 확정된 프로젝트 — 게이트가 아니라 추출 결과 처리를 보는 테스트들이다.
  const decided: Project = {
    id: '7f3c2a91-0000-4000-8000-000000000001', name: 'p', period: '', role: '',
    stack: [], lifecycle: [], narrative: '(주)정산 에서 중복 결제가 있었다',
    maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    matches: [{ nodeId: 'db-nosql', via: 'chip', evidence: 'Redis' }],
    updatedAt: '2026-08-06T00:00:00.000Z',
  }

  beforeEach(async () => {
    mockExtract.mockReset()
    localStorage.clear()
    const salt = randomSalt()
    const key = await deriveKey('pw', salt)
    useResumeStore.setState({
      ...useResumeStore.getInitialState(),
      status: 'unlocked', projects: [decided], error: null, key, salt: toB64(salt),
    })
  })

  it('merges returned ids into the project matches as via=llm', async () => {
    mockExtract.mockResolvedValue({
      ok: true, nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '중복 결제는 격리수준 문제로 이어진다' },
    })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => {
      const m = useResumeStore.getState().projects[0].matches
      expect(m.find((x) => x.nodeId === 'db-isolation')?.via).toBe('llm')
      // 기존 로컬 매칭이 사라지지 않는다.
      expect(m.some((x) => x.nodeId === 'db-nosql')).toBe(true)
    })
  })

  it('reports the rate limit without touching the project', async () => {
    mockExtract.mockResolvedValue({ ok: false, reason: 'rate_limited' })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/한도/)).toBeTruthy())
    expect(useResumeStore.getState().projects[0].matches).toEqual(decided.matches)
  })

  it('reports unauthenticated distinctly from a network failure', async () => {
    mockExtract.mockResolvedValue({ ok: false, reason: 'unauthenticated' })
    const { unmount } = render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/로그인/)).toBeTruthy())
    unmount()

    mockExtract.mockResolvedValue({ ok: false, reason: 'network' })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/네트워크/)).toBeTruthy())
  })

  // requestExtract는 마스킹 미확정에서 reject한다(Task 2) — Outcome이 아니라 예외다.
  // try/catch를 빼먹으면 unhandled rejection이 되고 화면에는 아무 일도 안 일어난다.
  it('catches the mask-gate rejection and shows its message', async () => {
    mockExtract.mockRejectedValue(new Error('마스킹 여부가 결정되지 않은 후보가 1개 있어 전송을 중단했습니다: 물류'))
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/결정되지 않은 후보가 1개/)).toBeTruthy())
  })

  it('disables the button while a request is in flight', async () => {
    let release: (v: { ok: false; reason: 'network' }) => void = () => {}
    mockExtract.mockReturnValue(new Promise((r) => { release = r }))
    render(<MaskPanel project={decided} nodes={nodes} />)
    const btn = screen.getByRole('button', { name: /AI 개념 추출/ })
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    // 두 번 눌려도 요청은 한 번이어야 한다 — 일일 상한을 두 칸 먹는다.
    fireEvent.click(btn)
    expect(mockExtract).toHaveBeenCalledTimes(1)
    release({ ok: false, reason: 'network' })
    await waitFor(() => expect(btn).not.toBeDisabled())
  })

  // review round 1 finding 1: requestExtract는 네트워크 왕복이라 수 초가 걸릴 수 있고,
  // 그 사이 사용자는 목록으로 돌아가 이 프로젝트를 삭제할 수 있다. 캡처된 project prop을
  // base로 계속 쓰면 응답이 온 뒤 upsertProject가 findIndex==-1로 append해 지운
  // 프로젝트를 같은 id로 되살린다 — persist()가 이미 겪은 문제(round 2 finding 1)와
  // 같은 클래스의 lost-update다.
  it('does not resurrect a project deleted while extraction is in flight', async () => {
    let release: (v: ExtractOutcome) => void = () => {}
    mockExtract.mockReturnValue(new Promise((r) => { release = r }))
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(mockExtract).toHaveBeenCalledTimes(1))

    // "목록으로 → 삭제"를 시뮬레이션한다 — store에서 프로젝트가 사라진다.
    useResumeStore.setState({ projects: [] })

    release({
      ok: true, nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '중복 결제는 격리수준 문제로 이어진다' },
    })
    await waitFor(() => expect(screen.getByText(/삭제되어/)).toBeTruthy())
    // 삭제된 프로젝트가 llm 매치와 함께 되살아나면 안 된다.
    expect(useResumeStore.getState().projects).toEqual([])
  })

  // review round 1 finding 1의 거울상: 삭제가 아니라 편집이다. 요청이 떠 있는 동안
  // 사용자가 이름·서술문을 고치고 새 마스킹 결정을 추가로 저장했다면, 응답이 도착했을
  // 때 그 편집 위에 병합해야 한다 — 캡처된(요청 시점의) project 위에 병합하면 방금
  // 저장된 편집과 마스킹 결정이 조용히 되돌아간다.
  it('merges onto the latest edited project, not the stale captured prop', async () => {
    let release: (v: ExtractOutcome) => void = () => {}
    mockExtract.mockReturnValue(new Promise((r) => { release = r }))
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(mockExtract).toHaveBeenCalledTimes(1))

    // "목록으로 → 편집(저장됨)"을 시뮬레이션한다.
    const edited: Project = {
      ...decided,
      name: '고친 이름',
      narrative: '새로 고쳐 쓴 서술문',
      maskDecisions: [...decided.maskDecisions, { text: '물류', kind: 'company', mask: true }],
    }
    useResumeStore.setState({ projects: [edited] })

    release({
      ok: true, nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '중복 결제는 격리수준 문제로 이어진다' },
    })
    await waitFor(() => {
      const p = useResumeStore.getState().projects[0]
      expect(p.matches.some((m) => m.nodeId === 'db-isolation')).toBe(true)
    })
    const p = useResumeStore.getState().projects[0]
    // 편집이 되돌아가지 않았어야 한다.
    expect(p.name).toBe('고친 이름')
    expect(p.narrative).toBe('새로 고쳐 쓴 서술문')
    expect(p.maskDecisions).toHaveLength(2)
  })

  // review round 1 finding 3: LLM에 보내는 서술문은 마스킹된 버전이라 reason 문장이
  // "[COMPANY_1]의 ..." 처럼 토큰을 그대로 인용할 수 있다(extract-prompt.ts가 실제로
  // 그렇게 하라고 지시한다). 이 토큰은 그 뒤 다른 결정이 되돌려지면 다른 대상을
  // 가리키게 되므로, 저장되는 evidence에 토큰 문자열이 살아 있으면 안 된다.
  it('strips mask tokens out of LLM reasons before they are persisted as evidence', async () => {
    mockExtract.mockResolvedValue({
      ok: true, nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '[COMPANY_1]의 정산 배치에서 격리 수준 문제가 있었다' },
    })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => {
      const m = useResumeStore.getState().projects[0].matches.find((x) => x.nodeId === 'db-isolation')
      expect(m).toBeTruthy()
      expect(m?.evidence).not.toMatch(/\[COMPANY_1\]/)
    })
  })

  // review round 1 finding 4: upsertProject의 반환값을 읽고도 실패를 배너로 보여주지
  // 않으면(반환값을 버리면) 디스크에 안 써졌는데 사용자는 성공한 줄 안다.
  it('shows the upsertProject failure reason when the disk write fails', async () => {
    mockExtract.mockResolvedValue({
      ok: true, nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '중복 결제는 격리수준 문제로 이어진다' },
    })
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/저장하지 못했|저장 공간/)).toBeTruthy())
    spy.mockRestore()
  })

  // review round 1 finding 4: dropped 카운트를 읽고도 안내하지 않으면, 환각/도메인
  // 노드가 조용히 버려졌다는 사실을 사용자가 알 길이 없다.
  it('reports how many AI-suggested concepts were dropped as unknown to the graph', async () => {
    mockExtract.mockResolvedValue({
      ok: true, nodeIds: ['db-isolation', 'ghost-node-that-does-not-exist'],
      reasons: {
        'db-isolation': '중복 결제는 격리수준 문제로 이어진다',
        'ghost-node-that-does-not-exist': '환각',
      },
    })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    // review round 4 finding 4: 예전엔 /1개/ 였다 — 같은 서브트리의 미리보기 통계
    // ("기술스택 N개" 등)와도 매치될 수 있는 모호한 정규식이라, 이 배너가 사라져도
    // 초록일 수 있었다. 배너 문구를 그대로 단정한다.
    await waitFor(() =>
      expect(screen.getByText('AI가 준 개념 1개는 그래프에 없어 버렸습니다.')).toBeTruthy())
  })
})
