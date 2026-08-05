import { describe, it, expect } from 'vitest'
import { parseVaultRow, interpretSave, loadVault, saveVault } from './resumeCloud'

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

  it('maps a 401 to unauthenticated', () => {
    expect(interpretSave(null, { code: '401', message: 'JWT expired' }))
      .toEqual({ ok: false, reason: 'unauthenticated' })
  })

  it('maps any other error to offline', () => {
    expect(interpretSave(null, { message: 'network down' }))
      .toEqual({ ok: false, reason: 'offline' })
  })
})

describe('without Supabase configured (test env)', () => {
  it('loadVault resolves to null instead of throwing', async () => {
    await expect(loadVault()).resolves.toBeNull()
  })

  it('saveVault reports unauthenticated instead of throwing', async () => {
    await expect(saveVault('s', { iv: 'a', ct: 'b' }, null))
      .resolves.toEqual({ ok: false, reason: 'unauthenticated' })
  })
})
