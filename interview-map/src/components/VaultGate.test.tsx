import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VaultGate } from './VaultGate'
import { useResumeStore } from '../store/resumeStore'

vi.setConfig({ testTimeout: 20000 })

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState({ status: 'none', salt: null, sealed: null, key: null, projects: [], error: null })
})

describe('VaultGate — status none', () => {
  it('warns that a lost passphrase cannot be recovered', () => {
    render(<VaultGate />)
    expect(screen.getByText(/복구할 수 없습니다/)).toBeTruthy()
  })

  it('refuses to create a vault when the two entries differ', () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'typo' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    expect(screen.getByText(/일치하지 않습니다/)).toBeTruthy()
    expect(useResumeStore.getState().status).toBe('none')
  })

  // 짧은 패스프레이즈는 PBKDF2 200k로도 무력하다. 막지 않으면 사용자는 '1234'를 쓴다.
  it('requires a minimum length', () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    expect(useResumeStore.getState().status).toBe('none')
  })

  it('creates the vault on a matching entry', async () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(useResumeStore.getState().status).toBe('unlocked'))
  })
})

describe('VaultGate — status locked', () => {
  it('shows the store error when the passphrase is wrong', async () => {
    // 실제 금고를 하나 만들고 잠근다 — 가짜 blob은 GCM 검증을 통과할 수 없어
    // "틀린 패스프레이즈" 경로를 진짜로 지나가지 못한다.
    await useResumeStore.getState().createVault('correct horse battery')
    useResumeStore.getState().lock()
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /열기/ }))
    await waitFor(() => expect(screen.getByText(/패스프레이즈가 다릅니다/)).toBeTruthy())
    expect(useResumeStore.getState().status).toBe('locked')
  })

  it('does not render any plaintext while locked', async () => {
    await useResumeStore.getState().createVault('correct horse battery')
    await useResumeStore.getState().upsertProject({
      id: '7f3c2a91-0000-4000-8000-000000000001', name: '비밀프로젝트명', period: '2025',
      role: 'backend', stack: [], lifecycle: [], narrative: '비밀서술문',
      maskDecisions: [], matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
    })
    useResumeStore.getState().lock()
    const { container } = render(<VaultGate />)
    expect(container.textContent).not.toContain('비밀프로젝트명')
    expect(container.textContent).not.toContain('비밀서술문')
  })
})
