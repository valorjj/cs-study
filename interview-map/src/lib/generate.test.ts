import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateQuestion } from './generate'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))
function httpErr(status: number) { return { name: 'FunctionsHttpError', context: new Response(null, { status }) } }

describe('generateQuestion', () => {
  beforeEach(() => { invoke.mockReset() })
  it('성공 → ok + question/reference', async () => {
    invoke.mockResolvedValue({ data: { question: 'Q?', reference: 'A.' }, error: null })
    expect(await generateQuestion('net-http', 'note')).toEqual({ ok: true, question: 'Q?', reference: 'A.' })
  })
  it('429 → rate_limited', async () => {
    invoke.mockResolvedValue({ data: null, error: httpErr(429) })
    expect(await generateQuestion('n', 'note')).toEqual({ ok: false, reason: 'rate_limited' })
  })
  it('401 → unauthenticated', async () => {
    invoke.mockResolvedValue({ data: null, error: httpErr(401) })
    expect(await generateQuestion('n', 'note')).toEqual({ ok: false, reason: 'unauthenticated' })
  })
  it('500 → gen_error', async () => {
    invoke.mockResolvedValue({ data: null, error: httpErr(500) })
    expect(await generateQuestion('n', 'note')).toEqual({ ok: false, reason: 'gen_error' })
  })
  it('필드 누락 → gen_error', async () => {
    invoke.mockResolvedValue({ data: { question: 'Q?' }, error: null })
    expect(await generateQuestion('n', 'note')).toEqual({ ok: false, reason: 'gen_error' })
  })
  it('throw → network', async () => {
    invoke.mockRejectedValue(new Error('x'))
    expect(await generateQuestion('n', 'note')).toEqual({ ok: false, reason: 'network' })
  })
})
