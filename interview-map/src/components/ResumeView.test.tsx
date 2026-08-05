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

  it('locks the vault and stops rendering the unlocked toolbar/projects', () => {
    renderUnlocked()
    expect(screen.getByRole('button', { name: /잠그기/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /잠그기/ }))
    expect(useResumeStore.getState().status).toBe('locked')
    expect(useResumeStore.getState().projects).toEqual([])
    expect(screen.queryByRole('button', { name: /잠그기/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /평문 JSON 내보내기/ })).toBeNull()
  })
})
