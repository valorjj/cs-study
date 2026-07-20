import { describe, it, expect } from 'vitest'
import { createSupabase } from './supabase'

describe('createSupabase', () => {
  it('returns null when url or anon key is missing (guest-only mode)', () => {
    expect(createSupabase(undefined, undefined)).toBeNull()
    expect(createSupabase('https://x.supabase.co', undefined)).toBeNull()
    expect(createSupabase('', '')).toBeNull()
  })
  it('returns a client when both are provided', () => {
    const c = createSupabase('https://x.supabase.co', 'anon-key')
    expect(c).not.toBeNull()
    expect(typeof c!.auth.signInWithOAuth).toBe('function')
  })
})
