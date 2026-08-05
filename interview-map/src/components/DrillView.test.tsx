import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DrillView } from './DrillView'
import { useGraphStore } from '../store/graphStore'
import type { GraphNode } from '../graph/types'

// 꼬리질문이 있는 체인 하나 (꼬리 없는 Q는 드릴 덱에서 제외된다)
const NOTE = `# TCP 노트

# TCP 기초

**Q1. 메인 질문?**
> 메인 답.

**꼬리 Q1-1. 꼬리 질문?**
> 꼬리 답.
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

describe('DrillView chain position', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({
      srs: {}, quizStats: {}, viewMode: 'quiz',
      quizPos: useGraphStore.getInitialState().quizPos,
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(NOTE) } as Response),
    ))
  })

  it('keeps the survival summary after 이 개념 보기 unmounts the tab', async () => {
    const first = render(<DrillView nodes={nodes} />)
    await screen.findByText('메인 질문?')

    fireEvent.click(screen.getByRole('button', { name: '답 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '알았음' }))
    expect(screen.getByText('꼬리 질문?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '답 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '몰랐음' }))
    expect(document.querySelector('.drill-depth')?.textContent).toContain('1/2')

    fireEvent.click(screen.getByRole('button', { name: /이 개념 보기/ }))
    first.unmount()

    render(<DrillView nodes={nodes} />)
    // 결과 화면 그대로 — 카드 1의 메인 질문으로 되돌아가지 않는다
    await screen.findByText(/생존 깊이/)
    expect(document.querySelector('.drill-depth')?.textContent).toContain('1/2')
  })

  it('keeps a mid-chain step across a remount', async () => {
    const first = render(<DrillView nodes={nodes} />)
    await screen.findByText('메인 질문?')
    fireEvent.click(screen.getByRole('button', { name: '답 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '알았음' }))
    expect(document.querySelector('.drill-stepnum')?.textContent).toContain('단계 2/2')
    first.unmount()

    render(<DrillView nodes={nodes} />)
    await screen.findByText('꼬리 질문?')
    expect(document.querySelector('.drill-stepnum')?.textContent).toContain('단계 2/2')
  })
})
