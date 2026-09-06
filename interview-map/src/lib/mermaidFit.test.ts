import { describe, it, expect } from 'vitest'
import { fitWidth, fitScale, MIN_LEGIBLE_SCALE } from './mermaidFit'

describe('fitWidth', () => {
  it('leaves a diagram that already fits at its natural size', () => {
    expect(fitWidth(600, 886)).toBe(600)
  })

  it('does not stretch a small diagram to fill the column', () => {
    // A four-node flowchart blown up to 886px would look like a poster.
    expect(fitWidth(300, 886)).toBe(300)
  })

  it('uses the full container when shrinking that far is still legible', () => {
    // 1000 → 886 is a 0.886 scale, above the floor, so it can just fit.
    expect(fitWidth(1000, 886)).toBe(886)
  })

  it('stops shrinking at the legibility floor and lets it overflow', () => {
    // The real case: net-osi at 1522px in an 886px column. 1522 × 0.8 = 1218,
    // which is wider than the container — so it scrolls rather than shrink to
    // the 8.7px it used to render at.
    expect(fitWidth(1522, 886)).toBe(1218)
    expect(fitWidth(1522, 886)).toBeGreaterThan(886)
  })

  it('never renders below the floor, at any container width', () => {
    for (const natural of [900, 1200, 1522, 2400, 5000]) {
      for (const container of [320, 414, 700, 886, 1020]) {
        expect(fitScale(natural, container)).toBeGreaterThanOrEqual(MIN_LEGIBLE_SCALE - 1e-9)
      }
    }
  })

  it('holds the floor on a phone, where the old behaviour was worst', () => {
    // 414px viewport: this used to scale to 0.25 and render 3.5px text.
    // Rounding to whole pixels means the scale lands just above the floor,
    // never on it exactly — the floor is what matters.
    const scale = fitScale(1522, 380)
    expect(scale).toBeGreaterThanOrEqual(MIN_LEGIBLE_SCALE)
    expect(scale).toBeLessThan(MIN_LEGIBLE_SCALE + 0.01)
  })

  it('survives a zero-width container from the first layout pass', () => {
    expect(fitWidth(800, 0)).toBe(800)
    expect(fitScale(800, 0)).toBe(1)
  })

  it('survives an unmeasurable diagram', () => {
    expect(fitWidth(0, 886)).toBe(886)
    expect(fitWidth(Number.NaN, 886)).toBe(886)
    expect(fitScale(0, 886)).toBe(1)
  })
})

describe('fitScale', () => {
  it('is 1 when nothing had to change', () => {
    expect(fitScale(600, 886)).toBe(1)
  })

  it('reports the actual shrink when the diagram fits after scaling', () => {
    expect(fitScale(1000, 886)).toBeCloseTo(0.886, 3)
  })

  it('keeps mermaid 15px labels at 12px or better', () => {
    for (const natural of [1000, 1428, 1468, 1522, 3000]) {
      expect(15 * fitScale(natural, 886)).toBeGreaterThanOrEqual(12 - 1e-6)
    }
  })
})
