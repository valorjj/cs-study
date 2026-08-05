import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectForm } from './ProjectForm'
import { useResumeStore } from '../store/resumeStore'
import type { Project } from '../lib/resumeTypes'
import type { GraphNode } from '../graph/types'

const node = (id: string, label: string, keywords: string[], level: 0 | 1 | 2 = 1): GraphNode => ({
  id, label, domain: 'database', level, icon: '', summary: '',
  keywords, status: 'todo', position: { x: 0, y: 0 },
})

// db-isolation은 서술문 어디에도 이름이 없어 로컬 매칭에 절대 걸리지 않는다 —
// 마지막 두 테스트가 그 성질에 기대어 llm 보존을 검증한다.
const nodes: GraphNode[] = [
  node('db-nosql', 'SQL vs NoSQL / Redis', ['NoSQL', 'Redis', '캐시']),
  node('db-isolation', '격리수준·이상현상', ['격리수준', '팬텀리드']),
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
    const onDone = vi.fn()
    render(<ProjectForm project={null} nodes={nodes} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '정산 서비스' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects).toHaveLength(1))
    const p = useResumeStore.getState().projects[0]
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(p.matches.some((m) => m.nodeId === 'db-nosql')).toBe(true)
    expect(onDone).toHaveBeenCalled()
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
})
