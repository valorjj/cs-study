import { describe, it, expect } from 'vitest'
import { buildGenerateMessages, parseGenerated } from '../../supabase/functions/_shared/generate-prompt'

describe('buildGenerateMessages', () => {
  it('system + 노트를 구분선으로 감싼 user', () => {
    const m = buildGenerateMessages('TCP는 연결형이다.', 1)
    expect(m[0].role).toBe('system')
    expect(m[0].content).toContain('노트') // 노트 근거로만 생성 규칙
    expect(m[1].role).toBe('user')
    expect(m[1].content).toContain('<<<NOTE>>>\nTCP는 연결형이다.\n<<<END>>>')
  })
})

describe('parseGenerated', () => {
  it('정상 JSON → {question, reference, grounded}', () => {
    expect(parseGenerated('{"question":"Q?","reference":"A."}')).toEqual({ question: 'Q?', reference: 'A.', grounded: true })
  })
  it('필드 누락/빈문자 → null', () => {
    expect(parseGenerated('{"question":"Q?"}')).toBeNull()
    expect(parseGenerated('{"question":"","reference":"A."}')).toBeNull()
  })
  it('JSON 아님 → null', () => {
    expect(parseGenerated('nope')).toBeNull()
  })
})
