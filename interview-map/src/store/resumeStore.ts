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

// 용량 초과 등으로 실제 디스크 쓰기가 실패하면 false를 돌려준다. 호출자(persist)가
// 이를 무시하고 성공을 자처하면, 메모리는 새 값을 들고 있는데 디스크는 옛 바이트인
// 채로 남는다 — Task 8에서 고친 것과 같은 부류의 결함이다.
function writeStoredVault(v: StoredVault): boolean {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify(v))
    return true
  } catch {
    return false
  }
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
  destroyVault: () => void
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
        const wrote = writeStoredVault({ salt, blob })
        if (!wrote) {
          // 디스크에 실제로 쓰이지 않았다. sealed를 갱신하면 메모리가 "저장됨"을
          // 자처하게 되므로, 실패를 그대로 알리고 in-memory 스냅샷은 옛 상태로 둔다.
          set({ error: '저장 공간이 부족하거나 오류가 발생해 변경사항을 저장하지 못했습니다.' })
          return
        }
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
      // 이미 금고가 있으면(locked든 unlocked든) 거부한다. 새 salt로 덮어쓰면 기존
      // 암호문의 복호화 경로(구 salt)가 사라져 모든 프로젝트가 영구히 읽을 수 없게
      // 된다 — upsertProject/removeProject의 "덮어쓰기 방지"보다 훨씬 큰 피해라
      // 되돌릴 방법이 없다. 명시적으로 지우려면 destroyVault를 먼저 호출해야 한다.
      if (get().status !== 'none') {
        set({ error: '이미 금고가 있습니다. 새로 만들려면 먼저 명시적으로 삭제해야 합니다.' })
        return
      }
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

    // 명시적 파기. createVault가 절대 하지 않는 "기존 금고를 지운다"를 사용자가
    // 의도적으로 요청했을 때만 호출한다.
    destroyVault: () => {
      localStorage.removeItem(RESUME_KEY)
      set({ status: 'none', salt: null, sealed: null, key: null, projects: [], error: null })
    },
  }
})
