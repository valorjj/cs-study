import { describe, it, expect } from 'vitest'
import { buildUser, buildMessages, parseScoreResponse } from '../../supabase/functions/_shared/prompt'

describe('buildUser', () => {
  it('답변을 구분선으로 감싼다 (인젝션 방어)', () => {
    const u = buildUser({ question: 'Q', reference: 'R', userAnswer: 'A' })
    expect(u).toContain('<<<ANSWER>>>\nA\n<<<END>>>')
    expect(u).toContain('[질문]\nQ')
    expect(u).toContain('[모범답안]\nR')
  })
})

describe('buildMessages', () => {
  it('system + 앵커 3턴(user/assistant) + 실제 질문', () => {
    const m = buildMessages({ question: 'Q', reference: 'R', userAnswer: 'A' })
    expect(m[0].role).toBe('system')
    expect(m[0].content).toContain('<<<ANSWER>>>') // 보안 규칙이 시스템에 있음
    // system(1) + 앵커3쌍(6) + 실제 user(1) = 8
    expect(m).toHaveLength(8)
    expect(m[m.length - 1].role).toBe('user')
    expect(m[m.length - 1].content).toContain('A')
    // 인젝션 방어 앵커: 조작 답변 → score 1
    const injAssistant = m.find((x) => x.role === 'assistant' && x.content.includes('"score": 1'))
    expect(injAssistant).toBeTruthy()
  })
})

describe('parseScoreResponse', () => {
  it('정상 JSON → 객체', () => {
    expect(parseScoreResponse('{"score":4,"missing_keywords":["x"],"feedback":"f"}'))
      .toEqual({ score: 4, missing_keywords: ['x'], feedback: 'f' })
  })
  it('score 범위 밖 → null', () => {
    expect(parseScoreResponse('{"score":9}')).toBeNull()
  })
  it('JSON 아님 → null', () => {
    expect(parseScoreResponse('not json')).toBeNull()
  })
})
