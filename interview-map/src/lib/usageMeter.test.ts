import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recentUsage } from './usageMeter'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

describe('recentUsage', () => {
  beforeEach(() => { rpc.mockReset() })
  it('성공 → per_min/hour/day 매핑', async () => {
    rpc.mockResolvedValue({ data: { per_min: 2, per_hour: 9, per_day: 40 }, error: null })
    expect(await recentUsage()).toEqual({ perMin: 2, perHour: 9, perDay: 40 })
  })
  it('누락 필드는 0', async () => {
    rpc.mockResolvedValue({ data: { per_hour: 5 }, error: null })
    expect(await recentUsage()).toEqual({ perMin: 0, perHour: 5, perDay: 0 })
  })
  it('error → null', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await recentUsage()).toBeNull()
  })
  it('throw → null', async () => {
    rpc.mockRejectedValue(new Error('x'))
    expect(await recentUsage()).toBeNull()
  })
})
