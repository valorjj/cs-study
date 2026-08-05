import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuizView } from './QuizView'
import { useGraphStore } from '../store/graphStore'
import { DEFAULT_QUIZ_SETTINGS } from '../lib/quizSettings'
import type { GraphNode } from '../graph/types'

const NOTE = `# TCP 노트

# TCP 기초

**Q1. 첫번째 질문?**
> 첫번째 답.

**Q2. 두번째 질문?**
> 두번째 답.

**Q3. 세번째 질문?**
> 세번째 답.
`

const nodes: GraphNode[] = [
  {
    id: 'net', label: '네트워크', domain: 'net', level: 0, icon: '', summary: '',
    keywords: [], status: 'todo', position: { x: 0, y: 0 },
  },
  {
    id: 'net-tcp', label: 'TCP', domain: 'net', level: 1, icon: '', summary: '',
    keywords: [], status: 'todo', noteRef: '/notes/03-network/tcp.md#tcp-기초',
    position: { x: 0, y: 0 },
  },
]

const counter = () => document.querySelector('.quiz-count')?.textContent

describe('QuizView card position', () => {
  beforeEach(() => {
    localStorage.clear()
    // sequential 순서 = 노트 등장 순서 → 덱이 결정적이라 카드 위치를 단정할 수 있다
    useGraphStore.setState({
      srs: {}, quizStats: {}, viewMode: 'quiz',
      quizSettings: { ...DEFAULT_QUIZ_SETTINGS, order: 'sequential' },
      quizPos: useGraphStore.getInitialState().quizPos,
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(NOTE) } as Response),
    ))
  })

  it('keeps the current card after 이 개념 보기 unmounts and the user returns', async () => {
    const first = render(<QuizView nodes={nodes} />)
    await screen.findByText('첫번째 질문?')

    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(screen.getByText('세번째 질문?')).toBeTruthy()
    expect(counter()).toBe('3 / 3')

    // "이 개념 보기" → viewMode 'list' → App이 퀴즈 탭을 언마운트한다
    fireEvent.click(screen.getByRole('button', { name: /이 개념 보기/ }))
    expect(useGraphStore.getState().viewMode).toBe('list')
    first.unmount()

    // 뒤로 와서 퀴즈 탭 재마운트
    render(<QuizView nodes={nodes} />)
    await screen.findByText('세번째 질문?')
    expect(counter()).toBe('3 / 3')
  })

  it('resets to the first card when the scope changes', async () => {
    render(<QuizView nodes={nodes} />)
    await screen.findByText('첫번째 질문?')
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(counter()).toBe('2 / 3')

    fireEvent.click(screen.getByRole('button', { name: '네트워크' }))
    expect(counter()).toBe('1 / 3')
    expect(screen.getByText('첫번째 질문?')).toBeTruthy()
  })

  it('keeps a revealed answer open across a remount', async () => {
    const first = render(<QuizView nodes={nodes} />)
    await screen.findByText('첫번째 질문?')
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    fireEvent.click(screen.getByRole('button', { name: '답 보기' }))
    expect(screen.getByText('두번째 답.')).toBeTruthy()
    first.unmount()

    render(<QuizView nodes={nodes} />)
    await screen.findByText('두번째 질문?')
    expect(counter()).toBe('2 / 3')
    expect(screen.getByText('두번째 답.')).toBeTruthy()
  })
})
