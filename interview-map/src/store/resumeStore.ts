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
  // 저장 직렬화. sealJson이 비동기여서, 두 변경이 겹치면 나중에 끝난 암호화가 이전
  // 스냅샷을 디스크에 덮어써 중간 편집이 조용히 사라진다. 체인으로 한 번에 하나씩
  // 쓰고, 인자로 받은 스냅샷이 아니라 그때그때의 최신 get().projects를 암호화한다.
  let writeChain: Promise<void> = Promise.resolve()

  const persist = (): Promise<void> => {
    writeChain = writeChain
      .then(async () => {
        const { key, salt, projects } = get()
        if (!key || !salt) return
        const blob = await sealJson(key, { version: 1, projects } satisfies VaultPayload)
        writeStoredVault({ salt, blob })
        set({ sealed: blob })
      })
      // 한 번의 실패가 이후 저장을 영구히 막지 않도록 체인을 되살린다.
      .catch(() => { /* ignore */ })
    return writeChain
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
      if (get().status !== 'unlocked') {
        set({ error: '금고가 잠겨 있어 저장하지 못했습니다.' })
        return
      }
      const cur = get().projects
      const i = cur.findIndex((x) => x.id === p.id)
      const next = i === -1 ? [...cur, p] : cur.map((x) => (x.id === p.id ? p : x))
      set({ projects: next })
      await persist()
    },

    removeProject: async (id) => {
      if (get().status !== 'unlocked') {
        set({ error: '금고가 잠겨 있어 저장하지 못했습니다.' })
        return
      }
      const next = get().projects.filter((p) => p.id !== id)
      set({ projects: next })
      await persist()
    },

    exportPlain: () => {
      const { status, projects } = get()
      return status === 'unlocked' ? { version: 1, projects } : null
    },
  }
})
