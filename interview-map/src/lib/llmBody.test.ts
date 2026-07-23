import { describe, it, expect } from 'vitest'
import { buildChatBody } from '../../supabase/functions/_shared/llm'

describe('buildChatBody', () => {
  it('OpenAI 호환 바디: model·messages·temperature 0·json 강제', () => {
    const body = buildChatBody('m', [{ role: 'system', content: 's' }]) as Record<string, unknown>
    expect(body.model).toBe('m')
    expect(body.temperature).toBe(0)
    expect(body.messages).toEqual([{ role: 'system', content: 's' }])
    expect(body.response_format).toEqual({ type: 'json_object' })
  })
})
