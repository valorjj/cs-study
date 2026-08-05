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
// 못 썼다"를 구별할 수 있어야 한다는 요건 때문에 Promise<void>로 둘 수 없다.
//
// round 0에선 ok:false 하나로 두 원인(상태 가드 거부 / 디스크 쓰기 실패)을 다 담고 "하나로
// 충분하다"고 주장했는데, round 1 리뷰가 그 주장 자체가 거짓이 되는 코드를 찾아냈다 —
// persist()가 큐에서 실제로 도는 시점에 key/salt가 사라져 있으면(예: set()과 persist() 사이,
// 다른 동기 호출로 lock()이 끼어든 경우) "아무것도 못 썼다"인데도 `{ ok: true }`를 돌려주고
// 있었다. 그래서 reason을 실제로 구분한다:
// - 'locked'  : 애초에 쓰기를 시도조차 못했다(상태 가드 거부, 또는 큐에 있던 작업이 실행될
//               때 이미 잠겨 있어 key/salt가 없음). 두 경우 모두 디스크는 손대지 않았다.
// - 'disk'    : 실제로 쓰기를 시도했고(sealJson까지 갔다) 그 시도 자체가 실패했다(용량 초과,
//               예기치 않은 예외 등).
export type PersistResult =
  | { ok: true }
  | { ok: false; reason: 'locked'; error: string }
  | { ok: false; reason: 'disk'; error: string }

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
  // 마지막으로 성공한 쓰기 이후 디스크 쓰기가 실패한 적이 있는지(reason:'disk'만 — 'locked'는
  // 애초에 쓰기를 시도조차 안 했으니 잃을 게 없다). true인 동안 projects는 디스크와 어긋나
  // 있을 수 있다는 뜻이다. lock()이 이걸 그대로 두면 사용자가 모르는 사이 그 어긋난 내용이
  // 사라진다(review round 1 finding 4) — 그래서 UI(ResumeView)가 이 플래그를 보고 잠그기
  // 전에 명시적 확인을 받는다.
  hasUnsavedFailure: boolean

  hydrate: () => void
  createVault: (passphrase: string) => Promise<void>
  unlock: (passphrase: string) => Promise<boolean>
  lock: () => void
  upsertProject: (p: Project) => Promise<PersistResult>
  removeProject: (id: string) => Promise<PersistResult>
  exportPlain: () => VaultPayload | null
  destroyVault: () => void
  // 저장 실패 배너를 사용자가 직접 지운다(설계 판단: 다음 저장 성공 또는 사용자의 명시적
  // 조치가 있을 때까지 남아야 한다 — 토스트처럼 저절로 사라지면 안 됨).
  clearError: () => void
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
        if (!key || !salt) {
          // set({projects: next})는 호출자(upsertProject/removeProject)의 동기 구간에서
          // 이미 끝났지만, 그 뒤 이 작업이 큐에서 실제로 실행되기 전에 다른 동기 호출로
          // lock()이 끼어들면 key/salt가 사라진다(review round 1 finding 1 — 실제로
          // 재현됨: upsertProject() 호출 직후 동기로 lock()을 부르면 이 분기를 탄다).
          // 이 경우 디스크에는 아무것도 쓰이지 않았다 — `{ ok: true }`를 돌려주면 쓴 적도
          // 없는 걸 성공이라 자처하는 거짓 보고가 된다. 상태 가드 거부와 같은 reason으로
          // 묶는다 — 둘 다 "쓰기를 시도조차 못했다"는 같은 사실이다.
          const error = '금고가 잠겨 있어 저장하지 못했습니다.'
          set({ error })
          return { ok: false, reason: 'locked', error }
        }
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
          //
          // hasUnsavedFailure를 세운다 — projects가 디스크와 어긋난 상태로 남았으니,
          // lock()이 이 어긋남을 사용자 모르게 지우면 안 된다(review round 1 finding 4).
          const error = '저장 공간이 부족하거나 오류가 발생해 변경사항을 저장하지 못했습니다.'
          set({ error, hasUnsavedFailure: true })
          return { ok: false, reason: 'disk', error }
        }
        set({ sealed: blob, hasUnsavedFailure: false })
        return { ok: true }
      } catch (e) {
        // sealJson 등이 예기치 않게 throw해도(예: key 문제) upsertProject/removeProject는
        // 절대 throw하지 않는다는 계약을 지킨다 — 실패를 반환값으로 알린다. 브라우저의
        // 원본 예외 메시지(예: "Failed to execute 'encrypt' on 'SubtleCrypto': …")는 그대로
        // 사용자에게 보여주지 않는다 — 내부 구현 세부사항이고 한국어도 아니다(review round 1
        // finding 7). 콘솔에만 남기고, 화면에는 위 디스크 쓰기 실패와 같은 문구를 쓴다 —
        // 사용자 입장에서 "쓰기를 시도했지만 실패했다"는 사실 자체는 같다.
        console.error('resumeStore: persist 중 예기치 않은 예외', e)
        const error = '저장 공간이 부족하거나 오류가 발생해 변경사항을 저장하지 못했습니다.'
        set({ error, hasUnsavedFailure: true })
        return { ok: false, reason: 'disk', error }
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
    hasUnsavedFailure: false,

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
      set({
        status: 'unlocked', salt: saltB64, sealed: blob, key, projects: [], error: null,
        hasUnsavedFailure: false,
      })
    },

    unlock: async (passphrase) => {
      const { salt, sealed } = get()
      if (!salt || !sealed) { set({ error: '금고가 없습니다.' }); return false }
      try {
        const key = await deriveKey(passphrase, fromB64(salt))
        const payload = await openJson<VaultPayload>(key, sealed)
        // 방금 디스크에서 새로 복호화한 것이 진실이다 — 이전 세션에서 남은
        // hasUnsavedFailure는 이번 unlock과 무관하다.
        set({ status: 'unlocked', key, projects: payload.projects ?? [], error: null, hasUnsavedFailure: false })
        return true
      } catch {
        // GCM 인증 태그 실패 = 틀린 패스프레이즈(또는 변조). 둘을 구분해줄 수 없다.
        set({ error: '패스프레이즈가 다릅니다.' })
        return false
      }
    },

    // error는 절대 여기서 지우지 않는다(review round 1 finding 4) — 잠그는 행위 자체가
    // 저장 실패를 해결한 게 아니다. hasUnsavedFailure는 여기서 false로 되돌린다 — 잠그면
    // projects가 []로 비워져 그 어긋남 자체가 사라지기 때문이다(이 사라짐에 대한 동의를
    // 받는 건 이 함수의 책임이 아니라 호출자의 책임이다 — ResumeView가 hasUnsavedFailure를
    // 보고 lock()을 부르기 전에 확인을 받는다).
    lock: () => set({ status: 'locked', key: null, projects: [], hasUnsavedFailure: false }),

    upsertProject: async (p) => {
      if (get().status !== 'unlocked') {
        const error = '금고가 잠겨 있어 저장하지 못했습니다.'
        set({ error })
        return { ok: false, reason: 'locked', error }
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
        return { ok: false, reason: 'locked', error }
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
      set({
        status: 'none', salt: null, sealed: null, key: null, projects: [], error: null,
        hasUnsavedFailure: false,
      })
    },

    clearError: () => set({ error: null }),
  }
})
