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
  it('embeds the FlowPlayer for the turn lifecycle', () => {
    render(<GuideView />)
    expect(document.querySelector('.flow-player')).toBeTruthy()
    // 플레이어의 스텝 카운터가 존재
    expect(document.querySelector('.fp-counter')).toBeTruthy()
  })
  it('has at least one deep-fold for technical detail', () => {
    render(<GuideView />)
    expect(document.querySelector('details.deep')).toBeTruthy()
  })
})
