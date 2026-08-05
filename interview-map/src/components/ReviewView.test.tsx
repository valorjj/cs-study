import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewView } from './ReviewView'
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

const counter = () => document.querySelector('.review-count')?.textContent

describe('ReviewView session position', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({
      srs: {}, quizStats: {}, viewMode: 'quiz',
      quizSettings: { ...DEFAULT_QUIZ_SETTINGS },
      quizPos: useGraphStore.getInitialState().quizPos,
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(NOTE) } as Response),
    ))
  })

  it('keeps the card and the frozen deck after 이 개념 보기 unmounts the tab', async () => {
    const first = render(<ReviewView nodes={nodes} />)
    await screen.findByText('첫번째 질문?')
    expect(counter()).toBe('1 / 3')

    // 한 장 채점 → srs가 바뀐다 (재빌드하면 이 카드는 덱에서 빠진다)
    fireEvent.click(screen.getByRole('button', { name: '답 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '쉬움' }))
    expect(counter()).toBe('2 / 3')

    fireEvent.click(screen.getByRole('button', { name: /이 개념 보기/ }))
    first.unmount()

    render(<ReviewView nodes={nodes} />)
    await screen.findByText('두번째 질문?')
    // 덱 길이도 유지 — 채점한 카드가 사라져 3→2로 줄지 않는다
    expect(counter()).toBe('2 / 3')
  })

  it('stays on the completion screen after finishing the deck and remounting', async () => {
    const first = render(<ReviewView nodes={nodes} />)
    await screen.findByText('첫번째 질문?')
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: '답 보기' }))
      fireEvent.click(screen.getByRole('button', { name: '쉬움' }))
    }
    expect(screen.getByText(/오늘 복습 완료/)).toBeTruthy()
    first.unmount()

    render(<ReviewView nodes={nodes} />)
    expect(await screen.findByText(/오늘 복습 완료/)).toBeTruthy()
  })
})
