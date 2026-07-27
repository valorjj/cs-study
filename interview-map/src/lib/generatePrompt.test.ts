import { describe, it, expect } from 'vitest'
import { buildGenerateMessages, buildBridgeMessages, parseGenerated } from '../../supabase/functions/_shared/generate-prompt'

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

describe('buildBridgeMessages', () => {
  it('홈 노트를 구분선으로 감싸고 상대 개념을 담는다', () => {
    const m = buildBridgeMessages('TCP는 연결형이다.', 'Spring MVC', 'MVC 웹 프레임워크')
    expect(m[0].role).toBe('system')
    expect(m[0].content).toContain('연결') // 두 개념의 연결을 묻는 규칙
    expect(m[1].role).toBe('user')
    expect(m[1].content).toContain('Spring MVC')
    expect(m[1].content).toContain('MVC 웹 프레임워크')
    expect(m[1].content).toContain('<<<NOTE>>>\nTCP는 연결형이다.\n<<<END>>>')
  })
  it('toSummary 없어도 동작', () => {
    const m = buildBridgeMessages('note', 'JWT')
    expect(m[1].content).toContain('JWT')
    expect(m[1].content).toContain('<<<NOTE>>>\nnote\n<<<END>>>')
  })
})
