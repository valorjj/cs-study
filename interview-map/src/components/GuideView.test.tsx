import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideView } from './GuideView'

describe('GuideView', () => {
  it('renders the lead heading and key section headings', () => {
    render(<GuideView />)
    expect(screen.getByText(/설계 가이드/)).toBeTruthy()
    expect(screen.getByText(/왜 graph DB/)).toBeTruthy()
    expect(screen.getByText(/한 턴의 생애/)).toBeTruthy()
  })
  it('embeds FlowPlayers for all three living flows', () => {
    render(<GuideView />)
    // 한 턴의 생애 + 깊이 사다리 + 개념 사이 순회 → 플레이어 3개
    expect(document.querySelectorAll('.flow-player').length).toBeGreaterThanOrEqual(3)
    expect(document.querySelectorAll('.fp-counter').length).toBeGreaterThanOrEqual(3)
  })
  it('has at least one deep-fold for technical detail', () => {
    render(<GuideView />)
    expect(document.querySelector('details.deep')).toBeTruthy()
  })
})
