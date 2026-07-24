import { describe, it, expect } from 'vitest'
import { buildHintMessages, parseHint } from './hint-prompt.ts'

describe('buildHintMessages', () => {
  it('wraps answer in delimiters and includes question', () => {
    const msgs = buildHintMessages('포트란?', '통신 종단점', '잘 모르겠어요')
    const user = msgs[msgs.length - 1]
    expect(user.content).toContain('<<<ANSWER>>>')
    expect(user.content).toContain('<<<END>>>')
    expect(user.content).toContain('포트란?')
  })
})
describe('parseHint', () => {
  it('parses hint', () => { expect(parseHint('{"hint":"소켓을 떠올려보세요"}')).toEqual({ hint: '소켓을 떠올려보세요' }) })
  it('null on broken/empty', () => {
    expect(parseHint('nope')).toBeNull()
    expect(parseHint('{"hint":""}')).toBeNull()
  })
})
