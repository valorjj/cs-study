import { describe, it, expect } from 'vitest'
import { routeFromScore } from './scoring'

describe('routeFromScore', () => {
  it('score >= 4 → DRILL_DOWN', () => {
    expect(routeFromScore(4)).toBe('DRILL_DOWN')
    expect(routeFromScore(5)).toBe('DRILL_DOWN')
  })
  it('score == 3 → PASS', () => {
    expect(routeFromScore(3)).toBe('PASS')
  })
  it('score <= 2 → EASIER', () => {
    expect(routeFromScore(2)).toBe('EASIER')
    expect(routeFromScore(1)).toBe('EASIER')
  })
})
