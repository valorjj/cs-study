import { describe, it, expect } from 'vitest'
import { randomSalt, toB64, fromB64, deriveKey, sealJson, openJson } from './vault'

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes including 0x00 and 0xff', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255])
    expect(Array.from(fromB64(toB64(bytes)))).toEqual(Array.from(bytes))
  })
})

describe('deriveKey', () => {
  it('same passphrase + same salt derives a key that opens the other one\'s output', async () => {
    const salt = randomSalt()
    const k1 = await deriveKey('correct horse', salt)
    const k2 = await deriveKey('correct horse', salt)
    const blob = await sealJson(k1, { a: 1 })
    await expect(openJson<{ a: number }>(k2, blob)).resolves.toEqual({ a: 1 })
  })

  it('different salt with the same passphrase does not interoperate', async () => {
    const k1 = await deriveKey('correct horse', randomSalt())
    const k2 = await deriveKey('correct horse', randomSalt())
    const blob = await sealJson(k1, { a: 1 })
    await expect(openJson(k2, blob)).rejects.toThrow()
  })
})

describe('sealJson / openJson', () => {
  it('round-trips a nested object', async () => {
    const key = await deriveKey('pw', randomSalt())
    const payload = { version: 1, projects: [{ id: 'p1', narrative: '한글 서술문 🙂' }] }
    const blob = await sealJson(key, payload)
    expect(await openJson(key, blob)).toEqual(payload)
  })

  it('produces a different iv (and ciphertext) for identical input', async () => {
    const key = await deriveKey('pw', randomSalt())
    const a = await sealJson(key, { x: 1 })
    const b = await sealJson(key, { x: 1 })
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)
  })

  it('rejects a wrong passphrase (GCM auth tag)', async () => {
    const salt = randomSalt()
    const blob = await sealJson(await deriveKey('right', salt), { x: 1 })
    await expect(openJson(await deriveKey('wrong', salt), blob)).rejects.toThrow()
  })

  it('rejects tampered ciphertext', async () => {
    const key = await deriveKey('pw', randomSalt())
    const blob = await sealJson(key, { x: 1 })
    const bytes = fromB64(blob.ct)
    bytes[0] ^= 0xff
    await expect(openJson(key, { iv: blob.iv, ct: toB64(bytes) })).rejects.toThrow()
  })
})
