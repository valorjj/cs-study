import { describe, it, expect, vi } from 'vitest'
import { parseVaultRow, interpretSave, loadVault, saveVault } from './resumeCloud'

// 이 파일은 "Supabase가 설정되지 않은 경우"의 동작을 검증한다. 이 저장소에는
// 로컬 .env.local이 있어 실제로는 클라이언트가 만들어지므로, 전역 테스트 설정을
// 건드리지 않고 이 파일에서만 모듈을 대체한다.
vi.mock('./supabase', () => ({ supabase: null }))

describe('parseVaultRow', () => {
  it('reads a well-formed row', () => {
    expect(parseVaultRow({
      salt: 'c2FsdA==', blob: { iv: 'aXY=', ct: 'Y3Q=' }, updated_at: '2026-08-05T00:00:00Z',
    })).toEqual({
      salt: 'c2FsdA==', blob: { iv: 'aXY=', ct: 'Y3Q=' }, updatedAt: '2026-08-05T00:00:00Z',
    })
  })

  it('returns null for null, a missing blob, or a half-built blob', () => {
    expect(parseVaultRow(null)).toBeNull()
    expect(parseVaultRow({ salt: 's', updated_at: 't' })).toBeNull()
    expect(parseVaultRow({ salt: 's', blob: { iv: 'x' }, updated_at: 't' })).toBeNull()
  })

  it('returns null when salt or updated_at is missing', () => {
    expect(parseVaultRow({ blob: { iv: 'a', ct: 'b' }, updated_at: 't' })).toBeNull()
    expect(parseVaultRow({ salt: 's', blob: { iv: 'a', ct: 'b' } })).toBeNull()
  })
})

describe('interpretSave', () => {
  it('treats a returned timestamp as success', () => {
    expect(interpretSave('2026-08-05T00:00:00Z', null))
      .toEqual({ ok: true, updatedAt: '2026-08-05T00:00:00Z' })
  })

  it('treats a null return as a conflict — another device wrote first', () => {
    expect(interpretSave(null, null)).toEqual({ ok: false, reason: 'conflict' })
  })

  describe('error classification', () => {
    const cases: Array<[string, { code?: string; message?: string }, 'unauthenticated' | 'offline']> = [
      ['RLS denial (logged-out user)', { code: '42501', message: 'new row violates row-level security policy for table "resume_vault"' }, 'unauthenticated'],
      ['expired JWT', { code: 'PGRST301', message: 'JWT expired' }, 'unauthenticated'],
      ['network failure', { message: 'Failed to fetch' }, 'offline'],
      ['unrelated postgres error', { code: '23505', message: 'duplicate key value violates unique constraint' }, 'offline'],
    ]
    for (const [label, error, reason] of cases) {
      it(`classifies ${label} as ${reason}`, () => {
        expect(interpretSave(null, error)).toEqual({ ok: false, reason })
      })
    }
  })
})

describe('without Supabase configured (test env)', () => {
  it('confirms the precondition: no Supabase client in this file', async () => {
    const { supabase } = await import('./supabase')
    expect(supabase).toBeNull()
  })

  it('loadVault resolves to null instead of throwing', async () => {
    await expect(loadVault()).resolves.toBeNull()
  })

  it('saveVault reports unauthenticated instead of throwing', async () => {
    await expect(saveVault('s', { iv: 'a', ct: 'b' }, null))
      .resolves.toEqual({ ok: false, reason: 'unauthenticated' })
  })
})
