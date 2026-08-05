import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResumeView } from './ResumeView'
import { useResumeStore } from '../store/resumeStore'
import type { Project } from '../lib/resumeTypes'

const PROJECT: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: '정산 서비스 개편', period: '2025',
  role: 'backend', stack: [], lifecycle: [], narrative: '서술',
  maskDecisions: [], matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
}

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState({ status: 'none', salt: null, sealed: null, key: null, projects: [], error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ResumeView는 마운트 시 hydrate()를 한 번 호출하고, hydrate는 localStorage를 읽어
// status를 'none'|'locked'로만 세팅한다('unlocked'로는 절대 세팅하지 않는다) — 그래서
// 여기서는 먼저 마운트해 그 1회성 hydrate를 흘려보낸 다음, 실제 unlock 이후 상태를
// 흉내 내어 store를 직접 unlocked로 옮긴다. VaultGate.test.tsx의 기존 테스트들도
// store 액션을 렌더 바깥에서 직접 호출하는 동일한 패턴을 쓴다.
function renderUnlocked(projects: Project[] = [PROJECT]) {
  const utils = render(<ResumeView />)
  act(() => {
    useResumeStore.setState({ status: 'unlocked', salt: 'salt', key: {} as CryptoKey, projects, error: null })
  })
  return utils
}

describe('ResumeView — unlocked toolbar', () => {
  it('exports a blob and revokes the object URL', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    // jsdom은 <a download> 클릭을 실제 다운로드로 이어가지 않지만, click() 호출 자체는
    // 그대로 지원한다 — 여기서는 Blob 생성과 revoke 타이밍만 검증한다.
    renderUnlocked()
    fireEvent.click(screen.getByRole('button', { name: /평문 JSON 내보내기/ }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    // revoke는 다음 tick(setTimeout 0)에서 일어난다 — click()과 같은 태스크에서 revoke하면
    // Firefox/Safari에서 blob URL이 다운로드가 읽기 전에 무효화될 수 있어서다.
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'))
  })

  it('does nothing when the vault is locked (exportPlain returns null)', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    render(<ResumeView />) // hydrate() → localStorage 비어 있음 → status 'none' → VaultGate
    // locked/none에서는 VaultGate가 렌더되어 내보내기 버튼 자체가 없다
    expect(screen.queryByRole('button', { name: /평문 JSON 내보내기/ })).toBeNull()
    expect(createObjectURL).not.toHaveBeenCalled()
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
