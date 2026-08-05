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

// RPC는 성공 시 새 updated_at을, 충돌 시 NULL을 돌려준다.
export function interpretSave(data: unknown, error: unknown): SaveResult {
  if (error) {
    const code = String((error as { code?: unknown }).code ?? '')
    const msg = String((error as { message?: unknown }).message ?? '')
    const unauth = code === '401' || /jwt|auth/i.test(msg)
    return { ok: false, reason: unauth ? 'unauthenticated' : 'offline' }
  }
  if (typeof data === 'string' && data) return { ok: true, updatedAt: data }
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
