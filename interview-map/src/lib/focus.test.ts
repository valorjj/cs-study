import { describe, it, expect } from 'vitest'
import { computeFocus } from './focus'

const adj = new Map<string, string[]>([
  ['jvm', ['java', 'jvm-gc']],
  ['jvm-gc', ['jvm', 'os-memory']],
  ['os-memory', ['jvm-gc']],
])

describe('computeFocus', () => {
  it('is inactive with no selection', () => {
    const r = computeFocus(null, adj)
    expect(r.isActive).toBe(false)
    expect(r.focused.size).toBe(0)
  })
  it('focuses selected + direct neighbors', () => {
    const r = computeFocus('jvm-gc', adj)
    expect(r.isActive).toBe(true)
    expect([...r.focused].sort()).toEqual(['jvm', 'jvm-gc', 'os-memory'])
  })
  it('handles a node with no edges', () => {
    const r = computeFocus('lonely', adj)
    expect([...r.focused]).toEqual(['lonely'])
  })
})
