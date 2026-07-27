import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FlowPlayer } from './FlowPlayer'
import type { Flow } from './types'

const flow: Flow = {
  stages: [ { id: 'a', label: 'A', color: '#3b82f6' }, { id: 'b', label: 'B', color: '#10b981' } ],
  nodes: [
    { id: 'n1', stage: 'a', title: 'Node1' },
    { id: 'n2', stage: 'b', title: 'Node2' },
  ],
  steps: [
    { title: 'step one', activeNodes: ['n1'], edges: [] },
    { title: 'step two', activeNodes: ['n2'], edges: [{ from: 'n1', to: 'n2' }] },
  ],
}

const active = (id: string) =>
  document.querySelector(`[data-node="${id}"]`)?.getAttribute('data-active') === 'true'

describe('FlowPlayer', () => {
  it('renders all nodes and starts at step 1', () => {
    render(<FlowPlayer flow={flow} />)
    expect(screen.getByText('Node1')).toBeTruthy()
    expect(screen.getByText('Node2')).toBeTruthy()
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    expect(active('n1')).toBe(true)
    expect(active('n2')).toBe(false)
  })

  it('next advances the active step, prev goes back, both clamp', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('2 / 2')
    expect(active('n2')).toBe(true)
    expect(active('n1')).toBe(false)
    // clamp at last
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('2 / 2')
    // prev back to 1, clamp at first
    fireEvent.click(screen.getByRole('button', { name: /이전/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    fireEvent.click(screen.getByRole('button', { name: /이전/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
  })

  it('restart returns to step 1', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    fireEvent.click(screen.getByRole('button', { name: /처음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    expect(active('n1')).toBe(true)
  })

  it('play button toggles to 일시정지 label', () => {
    render(<FlowPlayer flow={flow} />)
    const play = screen.getByRole('button', { name: /재생/ })
    fireEvent.click(play)
    expect(screen.getByRole('button', { name: /일시정지/ })).toBeTruthy()
  })

  it('renders step title and stage labels', () => {
    render(<FlowPlayer flow={flow} />)
    expect(screen.getByText('step one')).toBeTruthy()
    const root = document.querySelector('.flow-player') as HTMLElement
    expect(within(root).getByText('A')).toBeTruthy()
    expect(within(root).getByText('B')).toBeTruthy()
  })

  it('toggles fullscreen expand via the 크게 보기 button', () => {
    render(<FlowPlayer flow={flow} />)
    expect(document.querySelector('.flow-player--expanded')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }))
    expect(document.querySelector('.flow-player--expanded')).toBeTruthy()
    // 확대 중에도 카운터/버튼 라벨 유지
    expect(document.querySelector('.fp-counter')?.textContent).toBe('1 / 2')
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }))
    expect(document.querySelector('.flow-player--expanded')).toBeNull()
  })

  it('closes expand on Escape', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }))
    expect(document.querySelector('.flow-player--expanded')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.flow-player--expanded')).toBeNull()
  })

  it('keeps step navigation working while expanded', () => {
    render(<FlowPlayer flow={flow} />)
    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }))
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(document.querySelector('.fp-counter')?.textContent).toBe('2 / 2')
  })

  it('renders the visual-state legend', () => {
    render(<FlowPlayer flow={flow} />)
    const legend = document.querySelector('.fp-legend')
    expect(legend).toBeTruthy()
    expect(legend?.querySelector('.fp-lg-active')).toBeTruthy()
    expect(legend?.querySelector('.fp-lg-flow')).toBeTruthy()
    expect(legend?.querySelector('.fp-lg-dim')).toBeTruthy()
  })

  it('exposes a speed slider whose displayed value inverts (right = faster)', () => {
    render(<FlowPlayer flow={flow} />)
    const slider = screen.getByLabelText('재생 속도') as HTMLInputElement
    // 기본 1600ms → 표시값 = 600+3000-1600 = 2000
    expect(slider.value).toBe('2000')
    // 슬라이더를 오른쪽 끝(3000=빠름)으로 → speedMs = 600 → 표시값 다시 3000
    fireEvent.change(slider, { target: { value: '3000' } })
    expect(slider.value).toBe('3000')
  })
})
