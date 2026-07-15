import { describe, it, expect } from 'vitest'
import { domainColor } from './theme'

describe('domainColor', () => {
  it('returns a hex for known domains', () => {
    expect(domainColor('java')).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('returns fallback for unknown', () => {
    expect(domainColor('nope')).toBe('#64748b')
  })
})
