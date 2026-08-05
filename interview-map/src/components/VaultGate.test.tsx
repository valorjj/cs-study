import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VaultGate } from './VaultGate'
import { useResumeStore } from '../store/resumeStore'

// 몇몇 케이스가 createVault를 모킹으로 덮어쓴다. zustand store는 파일 전체에서 싱글턴이라,
// beforeEach에서 되돌려놓지 않으면 그 뒤 테스트들이 진짜 PBKDF2/AES-GCM 대신 모킹된
// 함수로 돌아가며 조용히 깨진다.
const REAL_CREATE_VAULT = useResumeStore.getState().createVault
const REAL_UNLOCK = useResumeStore.getState().unlock

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState({
    status: 'none', salt: null, sealed: null, key: null, projects: [], error: null,
    createVault: REAL_CREATE_VAULT, unlock: REAL_UNLOCK,
  })
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

  it('clears a stale mismatch message once the user edits either field (none branch)', () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'typo' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    expect(screen.getByText(/일치하지 않습니다/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'typo2' } })
    expect(screen.queryByText(/일치하지 않습니다/)).toBeNull()
  })

  // 짧은 패스프레이즈는 PBKDF2 200k로도 무력하다. 막지 않으면 사용자는 '1234'를 쓴다.
  // status만 보면 안 된다 — createVault(passphrase)는 deriveKey를 await하고 나서야
  // status를 바꾸므로, 유효한 21자 passphrase를 넣어도 클릭 직후 status는 여전히
  // 동기적으로 'none'이다. 렌더된 메시지를 단언해야 12자 규칙이 실제로 지켜진다.
  it('requires a minimum length', () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    expect(screen.getByText(/최소 12자/)).toBeTruthy()
    expect(useResumeStore.getState().status).toBe('none')
  })

  it('creates the vault on a matching entry', async () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(useResumeStore.getState().status).toBe('unlocked'), { timeout: 5000 })
  })

  // process.on('unhandledRejection', ...)으로 직접 감시하고 싶었지만 이 프로젝트의
  // tsconfig(app)에는 Node 타입이 없어 `process`가 타입 에러다(tsc -b 기준 게이트).
  // 대신 vitest 자체가 테스트 중 발생한 unhandled rejection을 해당 테스트의 실패로
  // 잡아준다 — handleCreate가 rejection을 catch하지 못했다면 이 테스트 자체가
  // (와 다른 테스트들도) 실패했을 것이다. 실제로 catch 블록을 넣기 전에는 이 테스트가
  // "Unhandled Rejection" 에러로 실패했다(아래 리포트의 사전 실패 로그 참고).
  it('shows a message and does not throw when createVault rejects', async () => {
    useResumeStore.setState({
      createVault: vi.fn().mockRejectedValue(new Error('no crypto.subtle')),
    })
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(screen.getByText(/금고를 만들지 못했습니다/)).toBeTruthy())
    expect(useResumeStore.getState().status).toBe('none')
  })

  it('renders a store error in the none branch (e.g. 이미 금고가 있습니다)', () => {
    useResumeStore.setState({ error: '이미 금고가 있습니다. 새로 만들려면 먼저 명시적으로 삭제해야 합니다.' })
    render(<VaultGate />)
    expect(screen.getByText(/이미 금고가 있습니다/)).toBeTruthy()
  })

  it('does not call createVault twice when clicked twice while submitting', async () => {
    let resolveCreate: () => void = () => {}
    const createVault = vi.fn(() => new Promise<void>((resolve) => { resolveCreate = resolve }))
    useResumeStore.setState({ createVault })
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'correct horse battery' } })
    const button = screen.getByRole('button', { name: /금고 만들기/ })
    fireEvent.click(button)
    expect(button).toBeDisabled()
    // 버튼이 disabled인 동안의 클릭과, Enter로 재시도하는 경로(form submit) 둘 다 확인
    fireEvent.click(button)
    fireEvent.submit(button.closest('form')!)
    expect(createVault).toHaveBeenCalledTimes(1)
    resolveCreate()
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  it('clears both inputs after a successful submit', async () => {
    // 진짜 createVault는 성공하면 status를 unlocked로 바꿔 VaultGate 자체가
    // return null로 사라진다 — 그러면 이 assertion은 unmount된 stale 노드를 보게 되어
    // "지웠는가"를 증명하지 못한다. status를 건드리지 않는 성공 모킹으로 컴포넌트를
    // 마운트된 채 두고 finally의 클리어 로직만 검증한다.
    useResumeStore.setState({ createVault: vi.fn().mockResolvedValue(undefined) })
    render(<VaultGate />)
    const passInput = screen.getByLabelText('패스프레이즈') as HTMLInputElement
    const confirmInput = screen.getByLabelText('패스프레이즈 확인') as HTMLInputElement
    fireEvent.change(passInput, { target: { value: 'correct horse battery' } })
    fireEvent.change(confirmInput, { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(passInput.value).toBe(''))
    expect(confirmInput.value).toBe('')
  })

  it('clears both inputs after a failed submit', async () => {
    useResumeStore.setState({ createVault: vi.fn().mockRejectedValue(new Error('boom')) })
    render(<VaultGate />)
    const passInput = screen.getByLabelText('패스프레이즈') as HTMLInputElement
    const confirmInput = screen.getByLabelText('패스프레이즈 확인') as HTMLInputElement
    fireEvent.change(passInput, { target: { value: 'correct horse battery' } })
    fireEvent.change(confirmInput, { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(screen.getByText(/금고를 만들지 못했습니다/)).toBeTruthy())
    expect(passInput.value).toBe('')
    expect(confirmInput.value).toBe('')
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
    await waitFor(() => expect(screen.getByText(/패스프레이즈가 다릅니다/)).toBeTruthy(), { timeout: 5000 })
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
    // textContent는 title/aria-label/value/placeholder/data-* 안의 문자열을 보지 못한다.
    // innerHTML은 그 전부를 포함하는 상위집합이라, 이 검사를 엄격하게 만든다(추가가 아니라
    // 대체).
    expect(container.innerHTML).not.toContain('비밀프로젝트명')
    expect(container.innerHTML).not.toContain('비밀서술문')
  })

  // review round 4 finding 3e: 만들기 경로의 이중 제출만 고정돼 있었다. 열기 경로에서
  // Enter를 연타하면 200k PBKDF2 유도가 두 번 돈다(느린 기기에서 체감되는 낭비이고,
  // 두 번째 결과가 나중에 도착해 store를 다시 덮는다). handleUnlock의 `if (busy) return`이
  // 그걸 막는다 — 그 한 줄을 지우면 이 테스트가 죽는다.
  it('does not call unlock twice when submitted twice while busy', async () => {
    await useResumeStore.getState().createVault('correct horse battery')
    useResumeStore.getState().lock()
    let resolveUnlock: (v: boolean) => void = () => {}
    const unlock = vi.fn(() => new Promise<boolean>((resolve) => { resolveUnlock = resolve }))
    useResumeStore.setState({ unlock })

    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    const button = screen.getByRole('button', { name: /열기/ })
    fireEvent.click(button)
    expect(button).toBeDisabled()
    // disabled 버튼 클릭과, Enter 재시도(form submit) 둘 다 확인한다 — 후자는 disabled
    // 속성으로 막히지 않으므로 `if (busy) return` 없이는 그대로 두 번째 유도가 돈다.
    fireEvent.click(button)
    fireEvent.submit(button.closest('form')!)
    expect(unlock).toHaveBeenCalledTimes(1)

    resolveUnlock(false)
    await waitFor(() => expect(button).not.toBeDisabled())
  }, 10000)

  it('hides a stale wrong-passphrase message once the user starts retyping', async () => {
    await useResumeStore.getState().createVault('correct horse battery')
    useResumeStore.getState().lock()
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /열기/ }))
    await waitFor(() => expect(screen.getByText(/패스프레이즈가 다릅니다/)).toBeTruthy(), { timeout: 5000 })
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'w' } })
    expect(screen.queryByText(/패스프레이즈가 다릅니다/)).toBeNull()
  })
})
