// Supabase 금고 행 로드/저장. 응답 해석은 순수 함수로 분리해 테스트 가능하게 뒀다
// (테스트 환경에는 Supabase env가 없어 클라이언트가 null이다).
import { supabase } from './supabase'
import type { SealedBlob } from './vault'

export interface VaultRow {
  salt: string
  blob: SealedBlob
  updatedAt: string      // 다음 저장의 baseline
}

export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; reason: 'conflict' | 'offline' | 'unauthenticated' }

function logError(op: string, error: unknown): void {
  if (!error) return
  // eslint-disable-next-line no-console
  console.error(`[resumeCloud] ${op} failed:`, error)
}

export function parseVaultRow(data: unknown): VaultRow | null {
  if (!data || typeof data !== 'object') return null
  const r = data as { salt?: unknown; blob?: unknown; updated_at?: unknown }
  const blob = r.blob as { iv?: unknown; ct?: unknown } | undefined
  if (typeof r.salt !== 'string' || typeof r.updated_at !== 'string') return null
  if (!blob || typeof blob.iv !== 'string' || typeof blob.ct !== 'string') return null
  return { salt: r.salt, blob: { iv: blob.iv, ct: blob.ct }, updatedAt: r.updated_at }
}

// rpc()의 오류는 PostgrestError다 — functions.invoke와 달리 HTTP status가 없고
// code는 PostgREST 코드나 Postgres SQLSTATE다. 그래서 상태코드를 보면 안 된다.
//   42501 = insufficient_privilege — 로그아웃 사용자가 RLS에 막힌 가장 흔한 경우
//   PGRST3xx = PostgREST 인증 계열 (만료된 JWT 등)
// 타입이 없는 오류 위의 추론이므로 메시지 패턴도 함께 본다. 판정을 틀려도
// 데이터가 사라지지는 않는다(둘 다 ok:false) — 사용자에게 잘못된 안내를 할 뿐이다.
function isAuthError(code: string, msg: string): boolean {
  const authSQLSTATE = new Set(['42501'])
  const authMsg = /jwt|not authenticated|row-level security|permission denied|권한/i
  return authSQLSTATE.has(code) || /^PGRST3/i.test(code) || authMsg.test(msg)
}

// RPC는 성공 시 새 updated_at을, 충돌 시 NULL을 돌려준다.
export function interpretSave(data: unknown, error: unknown): SaveResult {
  if (error) {
    const code = String((error as { code?: unknown }).code ?? '')
    const msg = String((error as { message?: unknown }).message ?? '')
    return { ok: false, reason: isAuthError(code, msg) ? 'unauthenticated' : 'offline' }
  }
  if (typeof data === 'string' && data) return { ok: true, updatedAt: data }
  if (data !== null && data !== undefined) {
    logError('interpretSave: unexpected rpc payload', data)
  }
  return { ok: false, reason: 'conflict' }
}

export async function loadVault(): Promise<VaultRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('resume_vault')
    .select('salt, blob, updated_at')
    .maybeSingle()
  if (error) { logError('loadVault', error); return null }
  return parseVaultRow(data)
}

export async function saveVault(
  salt: string, blob: SealedBlob, baseline: string | null,
): Promise<SaveResult> {
  if (!supabase) return { ok: false, reason: 'unauthenticated' }
  const { data, error } = await supabase.rpc('save_resume_vault', {
    p_salt: salt, p_blob: blob, p_baseline: baseline,
  })
  if (error) logError('saveVault', error)
  return interpretSave(data, error)
}
