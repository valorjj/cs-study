import { describe, it, expect } from 'vitest'
import { THEMES } from '../styles/themes'
import { mermaidThemeVariables } from './mermaidTheme'

describe('mermaidThemeVariables', () => {
  it('drives every colour from the requested theme, not a mermaid default', () => {
    const midnight = mermaidThemeVariables('midnight')
    const terminal = mermaidThemeVariables('terminal')
    expect(midnight.background).toBe('#0b1220')
    expect(terminal.background).toBe('#050b06')
    expect(midnight.textColor).not.toBe(terminal.textColor)
  })

  it('covers all six themes without producing an unresolvable value', () => {
    for (const theme of THEMES) {
      const vars = mermaidThemeVariables(theme.id)
      for (const [key, value] of Object.entries(vars)) {
        expect(value, `${theme.id}.${key}`).toBeTruthy()
        // Mermaid writes these into SVG presentation attributes, where CSS
        // functions and custom properties are not resolved.
        expect(value, `${theme.id}.${key}`).not.toMatch(/var\(|color-mix\(/)
      }
    }
  })

  it('falls back to the default theme for an unknown id rather than throwing', () => {
    expect(mermaidThemeVariables('does-not-exist')).toEqual(mermaidThemeVariables('midnight'))
  })

  it('mixes the note badge colour down to a literal hex mermaid can use', () => {
    // 16% accent over bg — must come out as a plain 6-digit hex.
    expect(mermaidThemeVariables('midnight').noteBkgColor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('names Korean-capable faces in the font stack', () => {
    expect(mermaidThemeVariables('midnight').fontFamily).toContain('Apple SD Gothic Neo')
    expect(mermaidThemeVariables('midnight').fontFamily).toContain('Noto Sans KR')
  })
})
