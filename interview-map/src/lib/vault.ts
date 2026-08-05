// E2E 암호화 금고. 저장되는 것은 암호문뿐이고, 파생 키는 호출자가 메모리에만 들고 있다.
// salt는 비밀이 아니므로 암호문과 함께 저장한다 — 새 기기가 salt + 패스프레이즈로
// 같은 키를 재파생할 수 있어야 "어디서든 재개"가 성립한다.

export interface SealedBlob {
  iv: string   // base64, 12바이트 (AES-GCM 권장 길이)
  ct: string   // base64, 암호문 + 인증 태그
}

const PBKDF2_ITERATIONS = 200_000
const SALT_BYTES = 16
const IV_BYTES = 12

// 반환형을 Uint8Array<ArrayBuffer>로 좁힌다. 기본 Uint8Array는
// Uint8Array<ArrayBufferLike>이고, 그 안에는 SharedArrayBuffer 백업도 포함되므로
// WebCrypto의 BufferSource 파라미터에 그대로 넘길 수 없다.
export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,                      // extractable=false — 키를 꺼낼 수 없게 한다
    ['encrypt', 'decrypt'],
  )
}

export async function sealJson(key: CryptoKey, obj: unknown): Promise<SealedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const pt = new TextEncoder().encode(JSON.stringify(obj))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt)
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) }
}

// 틀린 키·변조된 암호문은 GCM 인증 태그 검증에서 throw한다.
// 따라서 별도의 패스프레이즈 검증 로직이 필요 없다.
export async function openJson<T>(key: CryptoKey, blob: SealedBlob): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct),
  )
  return JSON.parse(new TextDecoder().decode(pt)) as T
}
