import { describe, it, expect } from 'vitest'
import { noteHash } from './noteHash'

describe('noteHash', () => {
  it('is deterministic', () => { expect(noteHash('포트는 종단점')).toBe(noteHash('포트는 종단점')) })
  it('differs for different input', () => { expect(noteHash('a')).not.toBe(noteHash('b')) })
  it('handles empty and unicode', () => {
    expect(typeof noteHash('')).toBe('string')
    expect(noteHash('한글 유니코드 😀')).not.toBe(noteHash('한글 유니코드'))
  })
})
