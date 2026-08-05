import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectForm } from './ProjectForm'
import { useResumeStore } from '../store/resumeStore'
import { deriveKey, randomSalt, toB64 } from '../lib/vault'
import type { Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'

const node = (id: string, label: string, keywords: string[], level: 0 | 1 | 2 = 1): GraphNode => ({
  id, label, domain: 'database', level, icon: '', summary: '',
  keywords, status: 'todo', position: { x: 0, y: 0 },
})

// db-isolation은 서술문 어디에도 이름이 없어 로컬 매칭에 절대 걸리지 않는다 —
// llm 보존을 검증하는 테스트들이 그 성질에 기댄다. database는 level 0 도메인
// 헤더라 mergeLlm이 개념 노드로 치지 않는다 — 그 규칙을 검증하는 데 쓴다.
const nodes: GraphNode[] = [
  node('db-nosql', 'SQL vs NoSQL / Redis', ['NoSQL', 'Redis', '캐시']),
  node('db-isolation', '격리수준·이상현상', ['격리수준', '팬텀리드']),
  node('database', 'Database', ['DB'], 0),
]

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState({
    ...useResumeStore.getInitialState(),
    status: 'unlocked', salt: 'salt', key: {} as CryptoKey,
  })
})

describe('ProjectForm', () => {
  it('requires a name and a narrative', () => {
    render(<ProjectForm project={null} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    expect(useResumeStore.getState().projects).toHaveLength(0)
    expect(screen.getByText('이름과 한 일은 비워둘 수 없습니다.')).toBeTruthy()
  })

  it('saves a new project with a generated id and runs local matching', async () => {
    // This test asserts onDone actually fires, i.e. that the save is reported as a real
    // success — the shared beforeEach's `key: {} as CryptoKey` is a fake that is not a
    // valid CryptoKey, so sealJson would throw and upsertProject would now correctly
    // report ok:false. A real derived key is needed here so the write can actually
    // succeed. (Other tests in this file only check `store.projects`, which is set
    // in memory before the write is attempted and so are indifferent to the fake key.)
    const salt = randomSalt()
    const key = await deriveKey('pw', salt)
    useResumeStore.setState({ key, salt: toB64(salt) })
    const onDone = vi.fn()
    render(<ProjectForm project={null} nodes={nodes} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '정산 서비스' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    // 실제 CryptoKey를 쓰므로 sealJson의 crypto.subtle.encrypt가 진짜 비동기로 돈다 —
    // store.projects는 persist()보다 먼저(동기) 갱신되므로 onDone까지 기다려야
    // 디스크 쓰기가 실제로 끝났다고 볼 수 있다.
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const p = useResumeStore.getState().projects[0]
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(p.matches.some((m) => m.nodeId === 'db-nosql')).toBe(true)
  })

  it('adds and removes stack chips', () => {
    render(<ProjectForm project={null} nodes={nodes} onDone={vi.fn()} />)
    const input = screen.getByLabelText('기술스택')
    fireEvent.change(input, { target: { value: 'Redis' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Redis')).toBeTruthy()
    // 중복은 무시한다 — 칩이 두 개가 되면 matchLocal이 같은 노드를 두 번 본다.
    fireEvent.change(input, { target: { value: 'Redis' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getAllByText('Redis')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Redis 삭제' }))
    expect(screen.queryByText('Redis')).toBeNull()
  })

  it('toggles lifecycle stages', async () => {
    render(<ProjectForm project={null} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: 'p' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: '한 일' } })
    fireEvent.click(screen.getByLabelText('트랜잭션 관리'))
    fireEvent.click(screen.getByLabelText('CI/CD'))
    fireEvent.click(screen.getByLabelText('CI/CD'))          // 껐다
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects).toHaveLength(1))
    expect(useResumeStore.getState().projects[0].lifecycle).toEqual(['tx'])
  })

  // 편집은 id를 보존해야 한다 — 새 id를 주면 같은 프로젝트가 두 개가 된다.
  it('preserves the id when editing', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000001', name: '옛이름', period: '2025', role: 'backend',
      stack: [], lifecycle: [], narrative: '한 일', maskDecisions: [], matches: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '새이름' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].name).toBe('새이름'))
    expect(useResumeStore.getState().projects).toHaveLength(1)
    expect(useResumeStore.getState().projects[0].id).toBe(existing.id)
    expect(useResumeStore.getState().projects[0].updatedAt).not.toBe(existing.updatedAt)
  })

  // 서술문을 고치면 매칭도 다시 돌아야 한다. 안 돌면 지도가 옛 문장을 반영한다.
  it('re-runs matching when the narrative changes', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000002', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '아무 기술도 없는 문장',
      maskDecisions: [], matches: [], updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].matches.some((m) => m.nodeId === 'db-nosql'))
        .toBe(true))
  })

  // 회귀 방지. via:'llm' 매칭은 서술문에 이름이 없는 개념이라 로컬 재매칭으로
  // 복원할 수 없다 — 로컬 결과로 덮어쓰면 AI 추출 결과가 편집 한 번에 사라진다.
  it('keeps existing llm matches when re-running local matching', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000003', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '중복 결제가 있었다', maskDecisions: [],
      matches: [{ nodeId: 'db-isolation', via: 'llm', evidence: '중복 결제는 격리수준 문제다' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => {
      const m = useResumeStore.getState().projects[0].matches
      expect(m.some((x) => x.nodeId === 'db-nosql')).toBe(true)
      expect(m.find((x) => x.nodeId === 'db-isolation')?.via).toBe('llm')
    })
  })

  // Finding 1: upsertProject never throws — it silently refuses when the vault isn't
  // unlocked and sets store.error. If submit doesn't check that, onDone() fires anyway
  // and the form closes with the user's typing thrown away.
  it('does not close the form and shows an error when the vault is locked at submit time', async () => {
    useResumeStore.setState({ status: 'locked' })
    const onDone = vi.fn()
    render(<ProjectForm project={null} nodes={nodes} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '정산 서비스' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(screen.getByText(/잠겨 있어 저장하지 못했습니다/)).toBeTruthy())
    expect(onDone).not.toHaveBeenCalled()
    expect(useResumeStore.getState().projects).toHaveLength(0)
    expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('정산 서비스')
    expect(screen.getByLabelText('한 일')).toHaveValue('Redis 캐시를 붙였다')
  })

  // Task 5b: the check ProjectForm uses to decide success must actually see a disk-write
  // failure, not just a status-guard refusal. Making localStorage.setItem throw forces a
  // real write failure while the vault stays unlocked — if the component fell back to
  // checking "is (id, updatedAt) present in store.projects" (as it used to), this would
  // pass regardless because upsertProject sets projects before the write is attempted.
  // Needs a real CryptoKey (not the other tests' fake `{}`) so sealJson actually reaches
  // writeStoredVault instead of failing earlier on an invalid key.
  it('does not close the form and shows an error when the disk write itself fails', async () => {
    const salt = randomSalt()
    const key = await deriveKey('pw', salt)
    useResumeStore.setState({ key, salt: toB64(salt) })
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const onDone = vi.fn()
    render(<ProjectForm project={null} nodes={nodes} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '정산 서비스' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(screen.getByText(/저장하지 못했습니다|저장 공간/)).toBeTruthy())
    spy.mockRestore()
    expect(onDone).not.toHaveBeenCalled()
    // 설계 판단(brief Step 3): 메모리는 유지한다 — 방금 타이핑한 게 store에는 들어가
    // 있어야 한다(디스크에 못 갔을 뿐).
    expect(useResumeStore.getState().projects).toHaveLength(1)
    expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('정산 서비스')
    expect(screen.getByLabelText('한 일')).toHaveValue('Redis 캐시를 붙였다')
  })

  // Finding 2: a preserved llm match whose nodeId no longer exists among the current
  // concept nodes (deleted/split) must be dropped, not carried forever.
  it('drops a preserved llm match whose node no longer exists', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000010', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '아무 기술도 없는 문장', maskDecisions: [],
      matches: [{ nodeId: 'db-removed-node', via: 'llm', evidence: '더 이상 없는 노드' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].updatedAt).not.toBe(existing.updatedAt))
    expect(useResumeStore.getState().projects[0].matches.some((m) => m.nodeId === 'db-removed-node'))
      .toBe(false)
  })

  // Finding 2: a preserved llm match pointing at a level-0 domain header is not a real
  // concept — mergeLlm's own rule drops it, and the inline merge must not skip that rule.
  it('drops a preserved llm match that points at a level-0 domain node', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000011', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '아무 기술도 없는 문장', maskDecisions: [],
      matches: [{ nodeId: 'database', via: 'llm', evidence: '도메인 헤더를 잘못 가리킴' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].updatedAt).not.toBe(existing.updatedAt))
    expect(useResumeStore.getState().projects[0].matches.some((m) => m.nodeId === 'database'))
      .toBe(false)
  })

  // Finding 2: if local matching now also finds the node an old llm match pointed at,
  // the result must have exactly one entry for that node (the local one), not two.
  it('does not duplicate a node that local matching now also finds', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000012', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '아무 기술도 없는 문장', maskDecisions: [],
      matches: [{ nodeId: 'db-nosql', via: 'llm', evidence: '옛 근거' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].updatedAt).not.toBe(existing.updatedAt))
    const m = useResumeStore.getState().projects[0].matches
    expect(m.filter((x) => x.nodeId === 'db-nosql')).toHaveLength(1)
    expect(m.find((x) => x.nodeId === 'db-nosql')?.via).not.toBe('llm')
  })

  // Finding 2: the surviving-match order must not shuffle between two saves of the
  // same unchanged data — a modal keyed off array order (or a naive re-render) would
  // otherwise flicker.
  it('keeps a stable match order across two identical saves', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000013', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: 'Redis 캐시를 붙였다', maskDecisions: [],
      matches: [{ nodeId: 'db-isolation', via: 'llm', evidence: '유지되는 근거' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    const first = render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].updatedAt).not.toBe(existing.updatedAt))
    const afterFirst = useResumeStore.getState().projects[0]
    const firstOrder = afterFirst.matches.map((m) => m.nodeId)
    first.unmount()

    render(<ProjectForm project={afterFirst} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].updatedAt).not.toBe(afterFirst.updatedAt))
    const secondOrder = useResumeStore.getState().projects[0].matches.map((m) => m.nodeId)

    expect(secondOrder).toEqual(firstOrder)
  })

  // Finding 3: editing a project that was removed elsewhere (e.g. the list's 삭제
  // button) while the form stayed open must not resurrect it via upsertProject's
  // findIndex===-1 append path.
  it('refuses to save and keeps input when the project being edited was deleted elsewhere', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000014', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '한 일', maskDecisions: [], matches: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    const onDone = vi.fn()
    render(<ProjectForm project={existing} nodes={nodes} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: '수정된 서술문' } })
    // 폼이 열려 있는 동안 다른 경로(목록의 삭제 버튼 등)로 지워졌다.
    useResumeStore.setState({ projects: [] })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(screen.getByText(/이미 삭제되었습니다/)).toBeTruthy())
    expect(onDone).not.toHaveBeenCalled()
    expect(useResumeStore.getState().projects).toHaveLength(0)
    expect(screen.getByLabelText('한 일')).toHaveValue('수정된 서술문')
  })

  // Finding 4: chips that only differ by case/spacing are storage duplicates even
  // though matchLocal already dedupes by nodeId — dedupe input using the same
  // normalizeTerm equivalence the matcher applies, keeping the original casing shown.
  it('dedupes stack chips case-insensitively, keeping the original casing', () => {
    render(<ProjectForm project={null} nodes={nodes} onDone={vi.fn()} />)
    const input = screen.getByLabelText('기술스택')
    fireEvent.change(input, { target: { value: 'Redis' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'redis' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getAllByText('Redis')).toHaveLength(1)
    expect(screen.queryByText('redis')).toBeNull()
  })
})
