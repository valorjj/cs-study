import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResumeView } from './ResumeView'
import { useResumeStore } from '../store/resumeStore'
import { deriveKey, randomSalt, toB64 } from '../lib/vault'
import type { Project } from '../lib/resumeTypes'

// 아래 "목록↔편집 이음새" 테스트만 이 모듈을 쓴다 — 네트워크 왕복을 우리가 붙잡고
// 있어야(응답 시점을 손으로 정해야) 재현되는 경합이기 때문이다. 다른 테스트들은
// MaskPanel을 열지 않으므로 이 모킹의 영향을 받지 않는다.
vi.mock('../lib/extract', () => ({ requestExtract: vi.fn(), prepareExtract: vi.fn() }))
import { requestExtract } from '../lib/extract'
import type { ExtractOutcome } from '../lib/extract'
const mockExtract = vi.mocked(requestExtract)

const PROJECT: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: '정산 서비스 개편', period: '2025',
  role: 'backend', stack: [], lifecycle: [], narrative: '비밀 서술문',
  maskDecisions: [], matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
}

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState(useResumeStore.getInitialState())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// hydrate()는 이제 status==='unlocked'일 때 no-op이므로(round 2 픽스), 마운트 전에
// unlocked를 seed해도 그대로 유지된다. round 1의 renderUnlocked는 "마운트 → 그 뒤에
// setState"였는데, 그건 hydrate가 무조건 재잠금하던 버그를 피해가는 우회였을 뿐 —
// 재마운트를 한 번도 겪지 않으므로 그 버그 자체를 절대 잡아낼 수 없었다.
function renderUnlocked(projects: Project[] = [PROJECT]) {
  useResumeStore.setState({ status: 'unlocked', salt: 'salt', key: {} as CryptoKey, projects, error: null })
  return render(<ResumeView />)
}

describe('ResumeView — 재마운트해도 금고가 다시 잠기지 않는다', () => {
  it('keeps the vault unlocked across an unmount/remount (StrictMode double-effect, tab revisit)', async () => {
    const first = render(<ResumeView />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(useResumeStore.getState().status).toBe('unlocked'), { timeout: 5000 })
    const keyAfterUnlock = useResumeStore.getState().key
    expect(keyAfterUnlock).not.toBeNull()

    first.unmount()
    // hydrate가 무조건 재실행되던 시절에는 여기서 status가 locked로, key가 null로
    // 되돌아갔다 — 사용자는 아무것도 안 했는데 다시 패스프레이즈를 쳐야 했다.
    render(<ResumeView />)
    expect(useResumeStore.getState().status).toBe('unlocked')
    expect(useResumeStore.getState().key).toBe(keyAfterUnlock)
  })
})

describe('ResumeView — unlocked toolbar', () => {
  it('the export button does not exist while locked/none (so it cannot be clicked)', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    render(<ResumeView />) // hydrate() → localStorage 비어 있음 → status 'none' → VaultGate
    expect(screen.queryByRole('button', { name: /평문 JSON 내보내기/ })).toBeNull()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('does nothing when exportPlain() itself returns null (defensive guard on the null branch)', () => {
    // 위 테스트는 "잠긴 화면엔 버튼이 없다"만 본다 — handleExport의
    // `if (!payload) return` 자체는 건드리지 않는다. 여기서는 버튼이 실제로 있는
    // unlocked 화면에서 exportPlain만 null을 돌려주도록 바꿔 그 가드를 직접 통과시킨다.
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    renderUnlocked()
    // act로 감싸지 않으면 ResumeView가 아직 이전 handleExport 클로저(진짜 exportPlain)를
    // 들고 있는 채로 클릭이 발사돼, 이 테스트가 검증하려는 가드를 실제로 통과하지 못한다.
    act(() => {
      useResumeStore.setState({ exportPlain: () => null })
    })
    fireEvent.click(screen.getByRole('button', { name: /평문 JSON 내보내기/ }))
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('exports the real payload, keeps the anchor in the DOM at click time, and revokes only after a tick', async () => {
    vi.useFakeTimers()
    try {
      let capturedBlob: Blob | null = null
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
        capturedBlob = b as Blob
        return 'blob:mock-url'
      })
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      let connectedAtClick = false
      let downloadAtClick = ''
      let hrefAtClick = ''
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          connectedAtClick = this.isConnected
          downloadAtClick = this.download
          hrefAtClick = this.href
        })

      renderUnlocked([PROJECT])
      fireEvent.click(screen.getByRole('button', { name: /평문 JSON 내보내기/ }))

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      // <a>가 document에 붙어 있지 않으면 일부 브라우저가 프로그래매틱 클릭을
      // 다운로드로 이어가지 않는다 — appendChild가 지워지면 여기서 죽는다.
      expect(connectedAtClick).toBe(true)
      expect(downloadAtClick).toBe('resume-vault-export.json')
      expect(hrefAtClick).toContain('blob:mock-url')
      // click과 같은 태스크에서 revoke하면 Firefox/Safari에서 다운로드가 blob URL을
      // 읽기 전에 무효화될 수 있다 — revoke가 여기서 이미 불렸다면 죽는다.
      expect(revokeObjectURL).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(1) })
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

      const text = await capturedBlob!.text()
      // 빈 객체({})를 내보내도 이 테스트 이전에는 초록이었다 — 실제 프로젝트 데이터가
      // Blob 안에 있는지를 직접 읽어서 확인한다.
      expect(text).toContain(PROJECT.name)
      expect(text).toContain(PROJECT.narrative)

      clickSpy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens MaskPanel for the clicked project, keeps it fresh from the store, and returns to the list', () => {
    renderUnlocked([PROJECT])
    fireEvent.click(screen.getByRole('button', { name: '마스킹' }))

    // 결정할 후보가 없는 서술문이라 게이트가 바로 열려 있고, 미리보기는 원문 그대로다.
    expect(screen.getByTestId('mask-preview').textContent).toBe(PROJECT.narrative)

    // MaskPanel은 project prop을 그대로 믿는 설계다(review round 1) — 그 신뢰가
    // 성립하려면 ResumeView가 store를 구독해 매 렌더마다 최신 프로젝트를 다시 찾아
    // 넘겨야 한다. 패널이 열려 있는 동안 store가 (다른 경로로) 갱신되는 것을 흉내 내,
    // 화면이 그 갱신을 실제로 반영하는지 확인한다 — 목록↔패널 전환 배선이 깨지면
    // (예: id를 잊거나 옛 project를 캡처해 두면) 여기서 잡힌다.
    act(() => {
      useResumeStore.setState({
        projects: [{ ...PROJECT, narrative: '갱신된 서술문', updatedAt: '2026-08-07T00:00:00.000Z' }],
      })
    })
    expect(screen.getByTestId('mask-preview').textContent).toBe('갱신된 서술문')

    fireEvent.click(screen.getByRole('button', { name: '목록으로' }))
    expect(screen.getByText(PROJECT.name)).toBeTruthy()
    expect(screen.queryByTestId('mask-preview')).toBeNull()
  })

  it('locks the vault and stops rendering the unlocked toolbar/projects', () => {
    renderUnlocked()
    expect(screen.getByRole('button', { name: /잠그기/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))
    expect(useResumeStore.getState().status).toBe('locked')
    expect(useResumeStore.getState().projects).toEqual([])
    expect(screen.queryByRole('button', { name: /잠그기/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /평문 JSON 내보내기/ })).toBeNull()
    // innerHTML, not textContent — attributes (title/aria-label/value/placeholder/data-*)
    // can leak plaintext even when no visible text node does. The list/form subtree is
    // gone via the unlocked-ternary unmount, but this pins that architecture down so a
    // future switch to CSS-based hiding would be caught here instead of shipping silently.
    expect(document.body.innerHTML).not.toContain(PROJECT.name)
    expect(document.body.innerHTML).not.toContain(PROJECT.narrative)
  })
})

// review round 1 finding 3/4: 목록의 삭제 버튼이 removeProject의 반환값을 그냥 버렸고,
// 실패해도 화면에 아무 신호가 없었다. 그리고 lock()이 error를 무조건 지우면서, 저장 실패로
// 디스크와 어긋난 채 남은 projects를 사용자 모르게 비웠다. renderUnlocked의 가짜 키
// (`{} as CryptoKey`)를 그대로 쓴다 — sealJson이 그 키로 던지면 outer catch가 잡아
// reason:'disk'로 분류하므로, localStorage를 따로 흔들 필요 없이 디스크 쓰기 실패를
// 재현할 수 있다.
describe('ResumeView — 저장 실패 배너와 잠그기 확인', () => {
  it("shows removeProject's failure via a persistent banner, and 닫기 dismisses it", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUnlocked([PROJECT])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/저장하지 못했습니다|저장 공간/)
    // 설계 판단: 삭제 자체(메모리 연산)는 반영된다 — 디스크 쓰기만 실패했다.
    expect(useResumeStore.getState().projects).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(useResumeStore.getState().error).toBeNull()
  })

  // review round 2 finding 3(두 번째 절): round 1은 "removeProject의 반환값을 실제로
  // 읽는다"고 주석에 썼지만 실제로는 `await removeProject(id)`만 하고 반환값을 버렸다 — 그
  // 읽기를 지워도 풀스위트가 그대로 초록이었다(리뷰어가 실제로 확인). 이 테스트는 반환값을
  // 실제로 소비해서만 나올 수 있는 결과(이 프로젝트의 *이름*이 들어간, store.error의 일반
  // 문구와는 다른 문장)를 확인한다 — 반환값을 버리면 이 특정 문구를 만들 방법이 없다.
  it("reads removeProject's return value to name which project failed to delete from disk", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUnlocked([PROJECT])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.getByText(new RegExp(`'${PROJECT.name}'.*디스크`))).toBeTruthy())
  })

  it('asks for confirmation (mentioning 평문 JSON 내보내기) before locking with an unsaved failure, and honors 취소', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUnlocked([PROJECT])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(useResumeStore.getState().hasUnsavedFailure).toBe(true))
    const errorBefore = useResumeStore.getState().error

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0][0]).toContain('평문 JSON 내보내기')
    // 취소했으니 잠기지 않고, 실패 메시지도 그대로 남아 있어야 한다.
    expect(useResumeStore.getState().status).toBe('unlocked')
    expect(useResumeStore.getState().error).toBe(errorBefore)
  })

  it('locks (without clearing the error) once the user confirms discarding the unsaved failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUnlocked([PROJECT])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(useResumeStore.getState().hasUnsavedFailure).toBe(true))
    const errorBefore = useResumeStore.getState().error

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))
    expect(useResumeStore.getState().status).toBe('locked')
    // lock()은 error를 지우지 않는다 — 잠그는 행위가 저장 실패를 해결한 게 아니다.
    expect(useResumeStore.getState().error).toBe(errorBefore)
  })

  it('locks without any confirmation prompt when there is no unsaved failure', () => {
    renderUnlocked()
    const confirmSpy = vi.spyOn(window, 'confirm')
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(useResumeStore.getState().status).toBe('locked')
  })

  // review round 2 minor 3: 위 "declining… honors 취소" 테스트는 실패한 쓰기가 *삭제*라서
  // projects가 이미 []다 — "취소하면 작업물이 안전하다"는 주장을 실제로는 아무것도 검증하지
  // 않는다(지킬 게 없다). 손으로 쓴 서술문이 실제로 존재하는 시나리오(실패한 *upsert*)로
  // 다시 검증한다.
  it("declining the lock prompt actually preserves hand-written prose (not just an already-empty list)", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUnlocked([])
    const withProse: Project = {
      ...PROJECT, id: 'p-with-prose', name: '중요 프로젝트', narrative: '아주 중요한 서술문',
    }
    act(() => { void useResumeStore.getState().upsertProject(withProse) })
    await waitFor(() => expect(useResumeStore.getState().hasUnsavedFailure).toBe(true))

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    // 취소했으니 잠기지 않았고, 손으로 쓴 서술문도 메모리에 그대로 있다.
    expect(useResumeStore.getState().status).toBe('unlocked')
    expect(useResumeStore.getState().projects.find((p) => p.id === 'p-with-prose')?.narrative)
      .toBe('아주 중요한 서술문')
  })

  // review round 2 minor 2: clearError는 error만 지운다 — hasUnsavedFailure는 그대로 남아
  // 있어야 배너를 닫은 뒤에도 "잠그기"가 여전히 확인을 요구한다(디스크와의 어긋남 자체는
  // 배너를 닫는다고 해소되지 않는다).
  it('keeps requiring lock confirmation after the banner is dismissed with 닫기', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUnlocked([PROJECT])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(useResumeStore.getState().hasUnsavedFailure).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(useResumeStore.getState().error).toBeNull()
    expect(useResumeStore.getState().hasUnsavedFailure).toBe(true)

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(useResumeStore.getState().status).toBe('unlocked')
  })
})

// review round 2 new important 1: hasUnsavedFailure만으로는 "저장 클릭 → 그 encrypt가 끝나기
// 전에 잠그기 클릭"이라는 실제 경합을 막을 수 없다 — 그 실패는 잠금이 이미 동기로 끝난 *뒤에*
// 큐 작업에서 뒤늦게 발견되기 때문이다. 이 경합은 standalone ProjectForm으로는 재현할 수 없다
// (locked가 되면 ResumeView가 ProjectForm을 통째로 unmount하므로, ProjectForm 자신의
// 필드-보존 단정은 도달 불가능한 상태를 검증하는 셈이다) — 그래서 여기서는 실제 조립
// (VaultGate → ResumeView 목록/폼)을 통해 재현한다. renderUnlocked의 가짜 키로는 sealJson이
// 곧바로(진짜 비동기 간극 없이) throw해 경합 창이 사실상 없어지므로, 진짜 CryptoKey가 필요하다
// — VaultGate의 실제 createVault를 그대로 탄다.
describe('ResumeView — 저장이 끝나기 전에 잠그면 경고한다 (real composition)', () => {
  it('warns before locking while a save is still in flight, and honoring 취소 keeps the prose alive', async () => {
    render(<ResumeView />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(useResumeStore.getState().status).toBe('unlocked'), { timeout: 5000 })

    fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }))
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '비밀 프로젝트' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: '아주 중요한 서술문' } })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    // 두 클릭 사이에 어떤 await도 없다 — sealJson의 real crypto.subtle.encrypt가 끝나기 전에
    // (JS는 이 동기 구간을 끝까지 실행한 뒤에야 그 microtask를 처리한다) 동기로 잠그기를 누른다.
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0][0]).toMatch(/저장이 아직 끝나지 않았습니다/)
    // 취소했으니 안 잠긴다 — 저장이 실제로 끝나길 기다린 뒤 서술문이 살아 있는지 확인한다.
    expect(useResumeStore.getState().status).toBe('unlocked')
    await waitFor(() => expect(useResumeStore.getState().projects).toHaveLength(1))
    expect(useResumeStore.getState().projects[0].narrative).toBe('아주 중요한 서술문')
    confirmSpy.mockRestore()
  }, 10000)
})

// review round 4 finding 1: 이 브랜치의 서명 결함(await를 건너 낡은 스냅샷을 읽는다)의
// 네 번째 인스턴스. ResumeView는 mapProject·maskingProject를 id로만 들고 매 렌더마다
// store에서 다시 찾는데(그 이유가 주석으로 적혀 있고, MaskPanel은 그 계약을 자기 파일
// 상단에 명시한다), 유일하게 ProjectForm에만 그 계약이 지켜지지 않아 편집 대상은 객체
// 스냅샷으로 얼어 있었다. 이 경합은 standalone ProjectForm으로는 절대 재현할 수 없다 —
// 얼어붙는 지점이 부모의 state이기 때문이다. 그래서 실제 조립(목록 → 마스킹 → 추출 →
// 목록 → 편집 → 저장)을 통해, 모든 단계를 실제 클릭으로 재현한다.
describe('ResumeView — 목록↔편집 이음새 (real composition)', () => {
  const NARRATIVE = '(주)정산 에서 중복 결제가 있었다'
  const DECIDED: Project = {
    id: '7f3c2a91-0000-4000-8000-000000000042', name: '오타 있는 이름', period: '2025',
    role: 'backend', stack: [], lifecycle: [], narrative: NARRATIVE,
    maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
  }

  it('does not drop the llm matches that landed while the edit form was open', async () => {
    mockExtract.mockReset()
    // 진짜 CryptoKey를 쓴다 — 저장이 실제로 암호화·기록까지 가야 "저장됐는데 llm 매칭이
    // 사라졌다"를 정직하게 관측할 수 있다.
    const salt = randomSalt()
    const key = await deriveKey('pw', salt)
    useResumeStore.setState({
      ...useResumeStore.getInitialState(),
      status: 'unlocked', projects: [DECIDED], error: null, key, salt: toB64(salt),
    })

    let release: (v: ExtractOutcome) => void = () => {}
    mockExtract.mockReturnValue(new Promise((r) => { release = r }))

    render(<ResumeView />)

    // 1) 마스킹 → AI 개념 추출 (네트워크 왕복이 떠 있는 상태)
    fireEvent.click(screen.getByRole('button', { name: '마스킹' }))
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(mockExtract).toHaveBeenCalledTimes(1))

    // 2) 목록으로 — MaskPanel은 unmount되지만 runExtract는 설계대로 계속 돈다
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }))

    // 3) 같은 프로젝트를 편집한다 (이 시점의 matches는 아직 비어 있다)
    fireEvent.click(screen.getByRole('button', { name: '편집' }))
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '고친 이름' } })

    // 4) 응답 도착 — runExtract가 store의 최신 프로젝트 위에 via:'llm'을 병합한다
    release({
      ok: true, nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '중복 결제는 격리 수준 문제로 이어진다' },
    })
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].matches
        .find((m) => m.nodeId === 'db-isolation')?.via).toBe('llm'))

    // 5) 사용자가 오타를 고치고 저장한다. 얼어붙은 스냅샷을 base로 쓰면 keptLlm이 빈
    //    배열이 되어 mergeLlm이 방금 병합된 llm 매칭을 전부 버리고, 그 잘린 결과가
    //    암호화되어 디스크에 기록된다.
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].name).toBe('고친 이름'))
    // 폼이 닫혔다 = 저장이 성공했다(실패하면 ProjectForm은 폼을 열어 둔다)
    await waitFor(() => expect(screen.getByRole('button', { name: '새 프로젝트' })).toBeTruthy())

    const saved = useResumeStore.getState().projects[0]
    expect(saved.matches.find((m) => m.nodeId === 'db-isolation')?.via).toBe('llm')
    // 마스킹 결정도 함께 살아남아야 한다 — 같은 base에서 읽는다.
    expect(saved.maskDecisions).toEqual(DECIDED.maskDecisions)
  }, 15000)

  // 위 이음새를 id로 고치면 딸려 오는 두 번째 성질: 복호화된 서술문이 부모 state에
  // 스냅샷으로 남지 않으므로, 잠근 뒤 다시 열었을 때 projects가 비어 있으면 그 문장이
  // 화면 어디에도 다시 나타나지 않는다(잠긴 동안 DOM에 없는 것과 별개의 성질이다 —
  // 예전에는 unlock 직후 textarea에 그대로 복원됐다).
  it('does not resurrect the decrypted narrative in the form after lock → unlock', async () => {
    useResumeStore.setState({
      status: 'unlocked', salt: 'salt', key: {} as CryptoKey, projects: [DECIDED], error: null,
    })
    render(<ResumeView />)
    fireEvent.click(screen.getByRole('button', { name: '편집' }))
    expect(screen.getByLabelText('한 일')).toHaveValue(NARRATIVE)

    act(() => { useResumeStore.getState().lock() })
    expect(document.body.innerHTML).not.toContain(NARRATIVE)

    // 프로젝트가 없는 상태로 다시 열린다(예: 다른 탭에서 비워졌거나 복호화 결과가 빈 금고).
    act(() => { useResumeStore.setState({ status: 'unlocked', key: {} as CryptoKey, projects: [] }) })
    expect(document.body.innerHTML).not.toContain(NARRATIVE)
    expect(screen.queryByLabelText('한 일')).toBeNull()
  })

  // removeFailure는 store가 아니라 컴포넌트 state였고, lock/unlock 어느 쪽도 지우지
  // 않았다 — 잠갔다 열면 이미 목록에 없는 항목에 대한 실패 문단이 되살아나고 닫을
  // 방법도 없었다.
  it('does not resurrect a stale delete-failure message after lock → unlock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUnlocked([PROJECT])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.getByText(new RegExp(`'${PROJECT.name}'`))).toBeTruthy())

    act(() => { useResumeStore.getState().lock() })
    act(() => { useResumeStore.setState({ status: 'unlocked', key: {} as CryptoKey, projects: [] }) })

    expect(screen.queryByText(new RegExp(`'${PROJECT.name}'`))).toBeNull()
  })
})
