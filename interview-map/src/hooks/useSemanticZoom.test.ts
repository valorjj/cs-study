import { describe, it, expect } from 'vitest'
import { visibleLevels } from './useSemanticZoom'

describe('visibleLevels', () => {
  it('shows only domains when zoomed far out', () => {
    expect(visibleLevels(0.4)).toEqual([0])
  })
  it('shows domains + major at mid zoom', () => {
    expect(visibleLevels(0.8)).toEqual([0, 1])
  })
  it('shows all levels when zoomed in', () => {
    expect(visibleLevels(1.5)).toEqual([0, 1, 2])
  })
})
