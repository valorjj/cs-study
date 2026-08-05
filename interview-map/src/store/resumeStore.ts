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

// upsertProject/removeProject의 반환값. 호출자가 "메모리에는 들어갔지만 디스크에는
// 못 썼다"를 구별할 수 있어야 한다는 요건 때문에 Promise<void>로 둘 수 없다. ok:false는
// 두 가지 서로 다른 원인을 모두 담는다 — (1) 상태 가드 거부(금고가 잠겨 있어 애초에
// set()도 안 함) (2) 디스크 쓰기 실패(set()은 됐지만 writeStoredVault가 false). 호출자
// 입장에서는 둘 다 "이 호출로 디스크에 반영됐다고 믿으면 안 된다"는 같은 결론이라 하나의
// 판별자로 충분하다 — 구분이 필요해지면 그때 원인 태그를 추가한다.
export type PersistResult = { ok: true } | { ok: false; error: string }

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
  upsertProject: (p: Project) => Promise<PersistResult>
  removeProject: (id: string) => Promise<PersistResult>
  exportPlain: () => VaultPayload | null
  destroyVault: () => void
}

export const useResumeStore = create<ResumeState>((set, get) => {
  // 저장 직렬화. sealJson이 비동기여서, 두 변경이 겹치면 나중에 끝난 암호화가 이전
  // 스냅샷을 디스크에 덮어써 중간 편집이 조용히 사라진다. 체인으로 한 번에 하나씩
  // 쓰고, 인자로 받은 스냅샷이 아니라 그때그때의 최신 get().projects를 암호화한다.
  //
  // 체인 자체는 항상 void로 resolve한다(에러를 삼킨다) — 한 번의 실패가 이후 저장을
  // 영구히 막으면 안 되기 때문이다. 각 persist() 호출이 돌려주는 건 체인이 아니라
  // 그 호출 자신의 작업(run) 프로미스다 — writeChain에 뒤이어 쌓인, 아직 시작하지
  // 않은 다른 호출의 결과가 섞여 들어오면 안 된다. run은 writeChain에 매달리기 전에
  // 만들어지므로(호출 순서대로 체인에 이어붙는다는 사실은 그대로) 두 번째 persist()가
  // 반환하는 프로미스는 오직 두 번째 작업이 끝났을 때만 resolve한다.
  let writeChain: Promise<void> = Promise.resolve()

  const persist = (): Promise<PersistResult> => {
    const run: Promise<PersistResult> = writeChain.then(async () => {
      try {
        const { key, salt, projects } = get()
        if (!key || !salt) return { ok: true }
        const blob = await sealJson(key, { version: 1, projects } satisfies VaultPayload)
        const wrote = writeStoredVault({ salt, blob })
        if (!wrote) {
          // 디스크에 실제로 쓰이지 않았다. sealed를 갱신하면 메모리가 "저장됨"을
          // 자처하게 되므로, 실패를 그대로 알리고 in-memory 스냅샷은 옛 상태로 둔다.
          //
          // projects는 여기서 되돌리지 않는다(설계 판단, brief Step 3) — 이건 사용자가
          // 손으로 쓴 이력서 문장이다. 롤백하면 화면과 디스크가 다시 맞아떨어지지만
          // 방금 타이핑한 내용이 사라진다; 유지하면 화면과 디스크가 어긋나지만 사용자가
          // 그 내용을 복사해 갈 수 있다. 후자를 택했다 — 사라지는 게 어긋나 있는 것보다
          // 나쁘다고 판단했고, 어긋남은 이 반환값과 배너로 알릴 수 있다. 대가: "화면에
          // 있는 것이 저장됐다"는 가정이 깨지므로, 이 실패를 알리는 배너는 사용자가
          // 지우거나 다음 저장이 성공할 때까지 화면에 남아야 한다(토스트처럼 사라지면
          // 안 됨) — 그래야 사용자가 "저장됐다"고 착각한 채 탭을 닫는 일을 막는다.
          const error = '저장 공간이 부족하거나 오류가 발생해 변경사항을 저장하지 못했습니다.'
          set({ error })
          return { ok: false, error }
        }
        set({ sealed: blob })
        return { ok: true }
      } catch (e) {
        // sealJson 등이 예기치 않게 throw해도(예: key 문제) upsertProject/removeProject는
        // 절대 throw하지 않는다는 계약을 지킨다 — 실패를 반환값으로 알린다.
        const error = e instanceof Error ? e.message : '변경사항을 저장하지 못했습니다.'
        set({ error })
        return { ok: false, error }
      }
    })
    // 체인은 run의 성패와 무관하게 항상 void로 이어간다.
    writeChain = run.then(() => undefined, () => undefined)
    return run
  }

  return {
    status: 'none',
    salt: null,
    sealed: null,
    key: null,
    projects: [],
    error: null,

    hydrate: () => {
      // 파생 키는 메모리 전용이다. hydrate는 "탭에 처음 들어왔을 때 저장된 금고가
      // 있는지 캐시를 데운다"는 뜻인데, 이미 unlocked인 상태에서 무조건 재실행하면
      // 그 키를 잃고 강제로 다시 잠근다 — 재마운트(StrictMode 이중 호출, 탭 이동 후
      // 복귀 등)마다 사용자가 매번 패스프레이즈를 다시 치게 된다.
      if (get().status === 'unlocked') return
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
      // upsertProject/removeProject와 같은 부류의 결함이 여기 있었다: writeStoredVault의
      // 반환값을 무시하고 무조건 unlocked로 전환했다 — 첫 쓰기가 실패하면 사용자는
      // 패스프레이즈를 설정하고 "잠금 해제됨, 비어 있음" 화면을 보지만 디스크에는
      // 아무것도 없다. 다만 여기서는 upsertProject 쪽의 "유지하고 실패를 반환한다"는
      // 판단을 그대로 따르지 않는다 — 지킬 사용자 입력이 없다(빈 프로젝트 목록뿐이므로
      // 잃을 게 없다). 그래서 실패하면 롤백한다: status를 'none'에 그대로 두고 error만
      // 세팅한다. 이러면 status==='unlocked' ⇒ salt가 디스크에 있다는 불변식이
      // createVault 실패 케이스에서도 깨지지 않는다 — VaultGate는 이 error를 그대로
      // 구독해 보여준다(별도 반환값 확인 없이도 동작).
      const wrote = writeStoredVault({ salt: saltB64, blob })
      if (!wrote) {
        set({ error: '저장 공간이 부족하거나 오류가 발생해 금고를 만들지 못했습니다.' })
        return
      }
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
        const error = '금고가 잠겨 있어 저장하지 못했습니다.'
        set({ error })
        return { ok: false, error }
      }
      const cur = get().projects
      const i = cur.findIndex((x) => x.id === p.id)
      const next = i === -1 ? [...cur, p] : cur.map((x) => (x.id === p.id ? p : x))
      // 이 set()은 이 함수의 유일한 await(persist()) 앞에 있어야 한다. 두 upsertProject
      // 호출이 겹치면(서로 다른 클릭 핸들러) 직렬화는 오직 이 순서 덕분에 성립한다 —
      // 첫 호출의 동기 구간(상태 가드 → 읽기 → set())이 그대로 끝난 뒤에야 첫 await로
      // 넘어가므로, 두 번째 호출이 시작될 때 get().projects는 이미 첫 호출의 결과를
      // 반영한 값이다. set() 앞에 await를 하나라도 끼워넣으면 이 read-modify-write
      // 창이 다시 열려 한쪽 결정이 사라질 수 있다.
      set({ projects: next })
      return persist()
    },

    removeProject: async (id) => {
      if (get().status !== 'unlocked') {
        const error = '금고가 잠겨 있어 저장하지 못했습니다.'
        set({ error })
        return { ok: false, error }
      }
      const next = get().projects.filter((p) => p.id !== id)
      // upsertProject와 같은 이유로 set()은 여기서도 유일한 await 앞에 있어야 한다.
      set({ projects: next })
      return persist()
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
