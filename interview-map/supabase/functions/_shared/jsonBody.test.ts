import { describe, it, expect } from 'vitest'
import { asObjectBody } from './jsonBody.ts'

describe('asObjectBody', () => {
  it('passes a plain object through', () => {
    expect(asObjectBody({ nodeId: 'x', rung: 1 })).toEqual({ nodeId: 'x', rung: 1 })
  })

  it('accepts an empty object — field validation is the caller\'s job, not this guard\'s', () => {
    expect(asObjectBody({})).toEqual({})
  })

  // 이것이 이 헬퍼의 존재 이유다. JSON.parse("null") 은 예외를 던지지 않으므로
  // try/catch 만으로는 걸리지 않고, 통과한 null 을 구조분해하면 TypeError 가 나서
  // 400 대신 500 이 응답된다.
  it('rejects null — the case that produced a 500 instead of a 400', () => {
    expect(asObjectBody(null)).toBeNull()
  })

  it('rejects an array (typeof [] === "object")', () => {
    expect(asObjectBody([])).toBeNull()
    expect(asObjectBody([{ nodeId: 'x' }])).toBeNull()
  })

  it.each([
    ['a bare string', '"x"'],
    ['a number', 42],
    ['a boolean', true],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(asObjectBody(value)).toBeNull()
  })
})
