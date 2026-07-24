import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

import { getHint } from './hint'

beforeEach(() => invoke.mockReset())

describe('getHint', () => {
  it('returns hint on success', async () => {
    invoke.mockResolvedValue({ data: { hint: '소켓을 떠올려보세요' }, error: null })
    expect(await getHint('q', 'r', 'a')).toEqual({ ok: true, hint: '소켓을 떠올려보세요' })
  })
  it('maps 429 to rate_limited', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 429 } } })
    expect(await getHint('q', 'r', 'a')).toEqual({ ok: false, reason: 'rate_limited' })
  })
  it('maps 401 to unauthenticated', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } })
    expect(await getHint('q', 'r', 'a')).toEqual({ ok: false, reason: 'unauthenticated' })
  })
  it('hint_error on bad data', async () => {
    invoke.mockResolvedValue({ data: { hint: '' }, error: null })
    expect(await getHint('q', 'r', 'a')).toEqual({ ok: false, reason: 'hint_error' })
  })
})
