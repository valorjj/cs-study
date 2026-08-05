// 이력 금고 store. graphStore와 분리한 이유: graphStore는 이미 선택·테마·뷰모드·
// 진행률·퀴즈통계·SRS·퀴즈설정·퀴즈위치를 들고 있어 관심사가 포화 상태다.
//
// 파생 키는 이 store의 메모리에만 존재한다. localStorage/sessionStorage에 키나
// 평문을 쓰지 않으므로, 새로고침하면 잠기고 패스프레이즈를 다시 받는다.
import { create } from 'zustand'
import {
  deriveKey, sealJson, openJson, randomSalt, toB64, fromB64, type SealedBlob,
} from '../lib/vault'
import type { Project, VaultPayload } from '../lib/resumeTypes'

export type VaultStatus = 'none' | 'locked' | 'unlocked'

export const RESUME_KEY = 'interview-map.resume.v1'

export interface StoredVault {
  salt: string        // base64
  blob: SealedBlob
}

export function readStoredVault(): StoredVault | null {
  try {
    const s = localStorage.getItem(RESUME_KEY)
    if (!s) return null
    const p = JSON.parse(s) as Partial<StoredVault>
    if (!p.salt || !p.blob?.iv || !p.blob?.ct) return null
    return { salt: p.salt, blob: p.blob }
  } catch {
    return null
  }
}

function writeStoredVault(v: StoredVault): void {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(v)) } catch { /* 용량 초과 등은 무시 */ }
}

interface ResumeState {
  status: VaultStatus
  salt: string | null            // base64. 비밀이 아니므로 평문 보관
  sealed: SealedBlob | null      // 잠긴 상태에서 들고 있는 암호문
  key: CryptoKey | null          // 메모리 전용. 절대 영속화하지 않는다
  projects: Project[]            // 평문. unlocked에서만 채워진다
  error: string | null

  hydrate: () => void
  createVault: (passphrase: string) => Promise<void>
  unlock: (passphrase: string) => Promise<boolean>
  lock: () => void
  upsertProject: (p: Project) => Promise<void>
  removeProject: (id: string) => Promise<void>
  exportPlain: () => VaultPayload | null
}

export const useResumeStore = create<ResumeState>((set, get) => {
  // 현재 프로젝트 목록을 봉인해 localStorage에 쓴다. 모든 변경의 마지막 단계.
  const persist = async (projects: Project[]): Promise<void> => {
    const { key, salt } = get()
    if (!key || !salt) return
    const blob = await sealJson(key, { version: 1, projects } satisfies VaultPayload)
    writeStoredVault({ salt, blob })
    set({ sealed: blob })
  }

  return {
    status: 'none',
    salt: null,
    sealed: null,
    key: null,
    projects: [],
    error: null,

    hydrate: () => {
      const stored = readStoredVault()
      if (!stored) { set({ status: 'none' }); return }
      set({ status: 'locked', salt: stored.salt, sealed: stored.blob, projects: [], key: null })
    },

    createVault: async (passphrase) => {
      const salt = randomSalt()
      const key = await deriveKey(passphrase, salt)
      const saltB64 = toB64(salt)
      const blob = await sealJson(key, { version: 1, projects: [] } satisfies VaultPayload)
      writeStoredVault({ salt: saltB64, blob })
      set({ status: 'unlocked', salt: saltB64, sealed: blob, key, projects: [], error: null })
    },

    unlock: async (passphrase) => {
      const { salt, sealed } = get()
      if (!salt || !sealed) { set({ error: '금고가 없습니다.' }); return false }
      try {
        const key = await deriveKey(passphrase, fromB64(salt))
        const payload = await openJson<VaultPayload>(key, sealed)
        set({ status: 'unlocked', key, projects: payload.projects ?? [], error: null })
        return true
      } catch {
        // GCM 인증 태그 실패 = 틀린 패스프레이즈(또는 변조). 둘을 구분해줄 수 없다.
        set({ error: '패스프레이즈가 다릅니다.' })
        return false
      }
    },

    lock: () => set({ status: 'locked', key: null, projects: [], error: null }),

    upsertProject: async (p) => {
      const cur = get().projects
      const i = cur.findIndex((x) => x.id === p.id)
      const next = i === -1 ? [...cur, p] : cur.map((x) => (x.id === p.id ? p : x))
      set({ projects: next })
      await persist(next)
    },

    removeProject: async (id) => {
      const next = get().projects.filter((p) => p.id !== id)
      set({ projects: next })
      await persist(next)
    },

    exportPlain: () => {
      const { status, projects } = get()
      return status === 'unlocked' ? { version: 1, projects } : null
    },
  }
})
