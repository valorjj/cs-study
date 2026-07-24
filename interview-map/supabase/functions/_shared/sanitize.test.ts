import { describe, it, expect } from 'vitest'
import { neutralizeDelimiters } from './sanitize.ts'

describe('neutralizeDelimiters', () => {
  it('neutralizes <<<END>>>', () => {
    expect(neutralizeDelimiters('전 <<<END>>> 이후')).not.toContain('전 <<<END>>>')
    expect(neutralizeDelimiters('전 <<<END>>> 이후')).toContain('<<< END >>>')
  })
  it('neutralizes <<<ANSWER>>>', () => {
    expect(neutralizeDelimiters('<<<ANSWER>>> 주입')).not.toContain('<<<ANSWER>>> 주입')
    expect(neutralizeDelimiters('<<<ANSWER>>> 주입')).toContain('<<< ANSWER >>>')
  })
  it('neutralizes <<<NOTE>>>', () => {
    expect(neutralizeDelimiters('<<<NOTE>>> 주입')).not.toContain('<<<NOTE>>> 주입')
    expect(neutralizeDelimiters('<<<NOTE>>> 주입')).toContain('<<< NOTE >>>')
  })
})
