import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResumeView } from './ResumeView'
import { useResumeStore } from '../store/resumeStore'
import type { Project } from '../lib/resumeTypes'

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
})
