import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideView } from './GuideView'

describe('GuideView', () => {
  it('renders key section headings', () => {
    render(<GuideView />)
    expect(screen.getByText(/왜 이 구조/)).toBeInTheDocument()
    expect(screen.getByText(/왜 graph DB를 쓰지 않았나/)).toBeInTheDocument()
    expect(screen.getByText(/깊이 사다리/)).toBeInTheDocument()
  })
  it('embeds all six diagrams', () => {
    const { container } = render(<GuideView />)
    expect(container.querySelectorAll('img.guide-diagram').length).toBe(6)
  })
})
