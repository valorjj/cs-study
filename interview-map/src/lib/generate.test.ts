import { describe, it, expect, vi, beforeEach } from 'vitest'
const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))
import { generateQuestion } from './generate'
beforeEach(() => invoke.mockReset())

describe('generateQuestion', () => {
  it('passes rung and noteHash in body', async () => {
    invoke.mockResolvedValue({ data: { question: 'q', reference: 'r', grounded: true }, error: null })
    await generateQuestion('net-http', 'note', 2, 'abcd1234')
    expect(invoke).toHaveBeenCalledWith('generate', { body: { nodeId: 'net-http', rung: 2, noteText: 'note', noteHash: 'abcd1234' } })
  })
  it('returns grounded question', async () => {
    invoke.mockResolvedValue({ data: { question: 'q', reference: 'r', grounded: false }, error: null })
    expect(await generateQuestion('n', 't', 1, 'h')).toEqual({ ok: true, skip: false, question: 'q', reference: 'r', grounded: false })
  })
  it('returns skip', async () => {
    invoke.mockResolvedValue({ data: { skip: true }, error: null })
    expect(await generateQuestion('n', 't', 4, 'h')).toEqual({ ok: true, skip: true })
  })
  it('maps 429', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 429 } } })
    expect(await generateQuestion('n', 't', 1, 'h')).toEqual({ ok: false, reason: 'rate_limited' })
  })
  it('maps 401 to unauthenticated', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } })
    expect(await generateQuestion('n', 't', 1, 'h')).toEqual({ ok: false, reason: 'unauthenticated' })
  })
  it('maps a generic error to gen_error', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 500 } } })
    expect(await generateQuestion('n', 't', 1, 'h')).toEqual({ ok: false, reason: 'gen_error' })
  })
  it('gen_error when question/reference missing', async () => {
    invoke.mockResolvedValue({ data: { question: '', reference: '' }, error: null })
    expect(await generateQuestion('n', 't', 1, 'h')).toEqual({ ok: false, reason: 'gen_error' })
  })
  it('network reason when invoke throws', async () => {
    invoke.mockRejectedValueOnce('network error')
    expect(await generateQuestion('n', 't', 1, 'h')).toEqual({ ok: false, reason: 'network' })
  })
})
