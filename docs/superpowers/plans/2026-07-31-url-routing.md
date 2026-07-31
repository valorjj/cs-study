# URL 해시 라우팅 / 뒤로가기 내비게이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `interview-map` 앱의 현재 위치를 `location.hash`에 반영해서 브라우저 뒤로/앞으로 버튼, 새로고침, 링크 공유가 모두 동작하게 한다.

**Architecture:** 순수 함수 모듈 `src/lib/route.ts`가 해시 ↔ `Route` 객체 변환을 담당하고, 훅 `src/hooks/useUrlSync.ts`가 zustand store와 History API를 양방향으로 잇는다. `history`를 만지는 코드는 이 훅 하나뿐이다. 그 전에 화면 상태 세 조각(`quizMode`, `trackId`, 개념 열기)을 컴포넌트 local state에서 store로 끌어올려 URL이 표현할 수 있게 만든다.

**Tech Stack:** React 19, zustand 5, TypeScript, Vite 8, vitest 4 + @testing-library/react (모두 이미 설치됨. **새 의존성 없음**).

**Spec:** `docs/superpowers/specs/2026-07-31-url-routing-design.md`

## Global Constraints

- 작업 디렉터리는 `interview-map/`. 모든 `npm` 명령은 이 폴더에서 실행한다.
- 새 의존성 추가 금지 (react-router 포함).
- URL 세그먼트는 인코딩하지 않는다. 노드 id는 `[a-z0-9-]`, 트랙 id는 `<종류>:<슬러그>` 이고 `:` 는 fragment에서 합법이다.
- `parseHash`는 전역 함수(total function)다. 절대 throw하지 않고, 어떤 입력에도 유효한 `Route`를 돌려준다.
- 주석은 한국어 또는 영어 모두 무방하나 기존 파일의 스타일을 따른다 (이 저장소는 영어 주석 + 한국어 UI 문구 혼용).
- 커밋 메시지는 한국어 제목, `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` 줄 포함. 커밋 이메일은 `30681841+valorjj@users.noreply.github.com` (공개 repo — 개인 이메일 금지). 브랜치는 이미 `feat/url-routing`.
- 각 태스크가 끝난 시점에 `npx tsc -b` 와 `npm test` 가 통과해야 한다. 즉 태스크마다 빌드가 초록색이다.

## 파일 구조

| 파일 | 책임 | 태스크 |
|------|------|--------|
| `src/store/graphStore.ts` | 앱 전역 상태. `quizMode`, `trackId`, `openNote` 추가 | 1, 2, 3 |
| `src/components/QuizTab.tsx` | local `mode` → store `quizMode` | 1 |
| `src/components/PathView.tsx` | local `selectedId` → store `trackId` | 2 |
| `src/components/QuizView.tsx` | `requestTrack` → `setTrackId` + `setViewMode` | 2 |
| `src/components/DrillView.tsx`, `ReviewView.tsx` | `select`+`setViewMode` → `openNote` | 3 |
| `src/lib/route.ts` (신규) | 해시 ↔ `Route` 순수 변환. React/store 런타임 의존 없음 | 4 |
| `src/hooks/useUrlSync.ts` (신규) | store ↔ History API 양방향 동기화. `history`를 만지는 유일한 곳 | 5 |
| `src/hooks/useTheme.ts` | viewMode **하이드레이트** 제거 (URL이 소스), 저장은 유지 | 5 |
| `src/App.tsx` | `useUrlSync()` 호출 추가 | 5 |

---

### Task 1: 퀴즈 서브모드를 store로 올리기

`QuizTab`의 local `useState<QuizMode>('flash')`를 store 상태로 바꾼다. `QuizMode` 타입도 `graphStore.ts`로 옮겨서 나중에 `route.ts`가 참조할 수 있게 한다 (`ViewMode`가 이미 store에 있는 것과 같은 방식).

**Files:**
- Modify: `src/store/graphStore.ts` (타입 `QuizMode` 추가, `GraphState`에 필드 2개 추가, 초기값 2개 추가)
- Modify: `src/components/QuizTab.tsx:16` (local 타입 선언 제거), `:33` (useState 제거), `:56-70` (setMode 호출부)
- Test: `src/store/graphStore.test.ts`

**Interfaces:**
- Produces: `export type QuizMode = 'flash' | 'drill' | 'review' | 'graph'` (from `src/store/graphStore.ts`), store fields `quizMode: QuizMode` / `setQuizMode: (m: QuizMode) => void`

- [ ] **Step 1: Write the failing test**

`src/store/graphStore.test.ts` 맨 아래에 추가:

```ts
describe('quizMode', () => {
  it('defaults to flash', () => {
    useGraphStore.setState({ quizMode: 'flash' })
    expect(useGraphStore.getState().quizMode).toBe('flash')
  })

  it('setQuizMode switches the active quiz sub-tab', () => {
    useGraphStore.getState().setQuizMode('drill')
    expect(useGraphStore.getState().quizMode).toBe('drill')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/store/graphStore.test.ts`
Expected: FAIL — `setQuizMode is not a function` (그리고 `npx tsc -b` 는 `Property 'quizMode' does not exist`)

- [ ] **Step 3: Write minimal implementation**

`src/store/graphStore.ts`, `ViewMode` 선언 바로 아래에 타입 추가:

```ts
export type ViewMode = 'home' | 'graph' | 'list' | 'quiz' | 'path' | 'guide'
export type QuizMode = 'flash' | 'drill' | 'review' | 'graph'
```

`GraphState` 인터페이스의 `setViewMode` 줄 아래에 추가:

```ts
  quizMode: QuizMode              // 퀴즈 탭 내부 서브모드 (플래시카드/드릴/복습/모의면접)
  setQuizMode: (m: QuizMode) => void
```

`create()` 안 `setViewMode` 줄 아래에 추가:

```ts
  quizMode: 'flash',
  setQuizMode: (m) => set({ quizMode: m }),
```

`src/components/QuizTab.tsx`:
- 16번 줄 `type QuizMode = 'flash' | 'drill' | 'review' | 'graph'` 삭제
- import 줄을 `import { useGraphStore, type QuizMode } from '../store/graphStore'` 로 변경 (`QuizMode`가 파일 내 다른 곳에서 쓰이면 그대로 동작). `useState` import는 `settingsOpen`이 계속 쓰므로 유지.
- 33번 줄 `const [mode, setMode] = useState<QuizMode>('flash')` 를 아래로 교체:

```ts
  const mode = useGraphStore((s) => s.quizMode)
  const setMode = useGraphStore((s) => s.setQuizMode)
```

렌더 부분(`mode === 'flash'`, `setMode('drill')` 등)은 이름이 같으므로 **수정 불필요**.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/store/graphStore.test.ts && npx tsc -b`
Expected: PASS, 타입 에러 없음

- [ ] **Step 5: Commit**

```bash
git add src/store/graphStore.ts src/store/graphStore.test.ts src/components/QuizTab.tsx
git commit -m "$(cat <<'EOF'
refactor(store): 퀴즈 서브모드를 QuizTab local state에서 store로 이동

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 코스 트랙 선택을 store로 올리기

지금 `pathTrackId`는 퀴즈 약점 칩이 쏘는 **일회성 요청**(`requestTrack` → PathView의 effect가 소비 → `clearPathTrack`)이고, 진짜 선택 상태는 `PathView`의 local `useState`에 있다. 이를 지속 상태 `trackId`로 합친다.

**Files:**
- Modify: `src/store/graphStore.ts` (`pathTrackId`/`requestTrack`/`clearPathTrack` → `trackId`/`setTrackId`)
- Modify: `src/components/PathView.tsx:34-56` (local state + 소비 effect), `:66` 근처 `pickTrack`
- Modify: `src/components/QuizView.tsx:28`, `:113`
- Test: `src/store/graphStore.test.ts`

**Interfaces:**
- Consumes: Task 1의 store 변경 없음 (독립)
- Produces: store fields `trackId: string | null` / `setTrackId: (id: string | null) => void`. `pathTrackId`, `requestTrack`, `clearPathTrack` 는 **삭제됨** — 이후 태스크에서 참조 금지.

- [ ] **Step 1: Write the failing test**

`src/store/graphStore.test.ts` 맨 아래에 추가:

```ts
describe('trackId', () => {
  it('defaults to null so PathView falls back to the first track', () => {
    useGraphStore.setState({ trackId: null })
    expect(useGraphStore.getState().trackId).toBeNull()
  })

  it('setTrackId selects a course and survives a view switch', () => {
    useGraphStore.getState().setTrackId('curated:junior-backend')
    useGraphStore.getState().setViewMode('list')
    expect(useGraphStore.getState().trackId).toBe('curated:junior-backend')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/store/graphStore.test.ts`
Expected: FAIL — `setTrackId is not a function`

- [ ] **Step 3: Write minimal implementation**

`src/store/graphStore.ts` — `GraphState`의 아래 3줄을

```ts
  pathTrackId: string | null                // 퀴즈 약점 칩 → 코스 탭 열기 요청
  requestTrack: (trackId: string) => void
  clearPathTrack: () => void
```

이렇게 교체:

```ts
  trackId: string | null                    // 코스 탭에서 선택된 트랙 (null = 첫 트랙)
  setTrackId: (id: string | null) => void
```

`create()` 안의

```ts
  pathTrackId: null,
  requestTrack: (trackId) => set({ pathTrackId: trackId, viewMode: 'path' }),
  clearPathTrack: () => set({ pathTrackId: null }),
```

를 이렇게 교체:

```ts
  trackId: null,
  setTrackId: (id) => set({ trackId: id }),
```

`src/components/PathView.tsx`:
- 34~39번 줄의 store 셀렉터 블록에서 `pathTrackId`/`clearPathTrack` 두 줄을 삭제하고 대신 추가:

```ts
  const trackId = useGraphStore((s) => s.trackId)
  const setTrackId = useGraphStore((s) => s.setTrackId)
```

- 47~56번 줄(local `selectedId` state, `mobileDetail` state, 소비 effect)을 아래로 교체:

```ts
  // Course deep-links (#/path/<id>) and the quiz weak-domain chip both arrive as
  // a non-null trackId, so seed the mobile detail pane open in that case.
  const [mobileDetail, setMobileDetail] = useState(trackId != null)
  useEffect(() => { if (trackId) setMobileDetail(true) }, [trackId])

  const selectedId = trackId ?? tracks[0]?.id ?? ''
```

- `pickTrack`을 아래로 교체:

```ts
  const pickTrack = (id: string) => { setTrackId(id); setMobileDetail(true) }
```

(`selectedId`를 읽는 나머지 코드 — `data-active={t.id === selectedId}`, `tracks.find(...)` — 는 이름이 같아 수정 불필요. `useState`/`useEffect` import는 계속 쓰이므로 유지.)

`src/components/QuizView.tsx`:
- 28번 줄을 `const setTrackId = useGraphStore((s) => s.setTrackId)` 로 교체
- 113번 줄의 `onClick`을 아래로 교체:

```tsx
            <button key={w.domain} className="quiz-weak-chip" onClick={() => { setTrackId(`domain:${w.domain}`); setViewMode('path') }}>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/store/graphStore.test.ts && npx tsc -b`
Expected: PASS, 타입 에러 없음. `grep -rn "pathTrackId\|requestTrack\|clearPathTrack" src/` 는 결과가 없어야 한다.

- [ ] **Step 5: Commit**

```bash
git add src/store/graphStore.ts src/store/graphStore.test.ts src/components/PathView.tsx src/components/QuizView.tsx
git commit -m "$(cat <<'EOF'
refactor(store): 코스 트랙 선택을 일회성 요청에서 지속 상태로 승격

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `openNote` 원자 액션

네 곳이 `select(id)` 와 `setViewMode('list')` 를 연달아 호출한다. `set`이 두 번이면 구독자(=Task 5의 URL 동기화)도 두 번 깨어나 중간 상태가 새어나간다. 한 액션으로 묶는다.

**Files:**
- Modify: `src/store/graphStore.ts`
- Modify: `src/components/PathView.tsx:66` 근처, `src/components/QuizView.tsx:137`, `src/components/ReviewView.tsx:95`, `src/components/DrillView.tsx:180`
- Test: `src/store/graphStore.test.ts`

**Interfaces:**
- Consumes: Task 2의 store 형태
- Produces: store action `openNote: (id: string) => void`

- [ ] **Step 1: Write the failing test**

`src/store/graphStore.test.ts` 맨 아래에 추가. 핵심은 **구독자 알림이 한 번**이라는 것 — 이게 히스토리 엔트리 하나에 대응한다.

```ts
describe('openNote', () => {
  it('sets selection and view mode in a single notification', () => {
    useGraphStore.setState({ selectedId: null, viewMode: 'path', focusRequestId: 'stale' })
    let notifications = 0
    const unsub = useGraphStore.subscribe(() => { notifications++ })

    useGraphStore.getState().openNote('dsa-bigo')

    unsub()
    const s = useGraphStore.getState()
    expect(s.selectedId).toBe('dsa-bigo')
    expect(s.viewMode).toBe('list')
    expect(s.focusRequestId).toBeNull()
    expect(notifications).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/store/graphStore.test.ts`
Expected: FAIL — `openNote is not a function`

- [ ] **Step 3: Write minimal implementation**

`src/store/graphStore.ts` — `GraphState`의 `select` 줄 아래에 추가:

```ts
  openNote: (id: string) => void  // 다른 탭에서 노트 열기 (선택 + list 모드 전환을 한 번에)
```

`create()` 안 `select` 줄 아래에 추가:

```ts
  // One atomic set: two separate sets would emit an intermediate state to
  // subscribers (and, via useUrlSync, a bogus extra history entry).
  openNote: (id) => set({ selectedId: id, viewMode: 'list', focusRequestId: null }),
```

네 컴포넌트에서 각각:
- 셀렉터 `const openNote = useGraphStore((s) => s.openNote)` 추가
- `PathView.tsx`: `const openNode = (id: string) => { select(id); setViewMode('list') }` → `const openNode = (id: string) => openNote(id)`
- `QuizView.tsx:137`: `onClick={() => { select(card.nodeId); setViewMode('list') }}` → `onClick={() => openNote(card.nodeId)}`
- `ReviewView.tsx:95`: 같은 형태 → `onClick={() => openNote(card.nodeId)}`
- `DrillView.tsx:180`: `onClick={() => { select(chain.nodeId); setViewMode('list') }}` → `onClick={() => openNote(chain.nodeId)}`
- 각 파일에서 `select` / `setViewMode` 셀렉터가 **다른 곳에서도 쓰이는지** 확인하고 (예: `ReviewView.tsx:69`는 `setViewMode('quiz')`를 쓴다) 안 쓰이면 셀렉터 줄을 삭제한다. `npx tsc -b` 의 unused 경고와 `npm run lint` 로 확인.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/graphStore.ts src/store/graphStore.test.ts src/components/PathView.tsx src/components/QuizView.tsx src/components/ReviewView.tsx src/components/DrillView.tsx
git commit -m "$(cat <<'EOF'
refactor(store): 노트 열기를 openNote 단일 액션으로 통합

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `route.ts` — 해시 ↔ Route 순수 변환

React도 store 런타임도 참조하지 않는 순수 모듈. 스펙의 URL 문법표를 그대로 구현한다.

**Files:**
- Create: `src/lib/route.ts`
- Test: `src/lib/route.test.ts` (신규)

**Interfaces:**
- Consumes: `import type { ViewMode, QuizMode } from '../store/graphStore'` (Task 1에서 추가된 `QuizMode` — **type-only import**라 런타임 순환 의존이 없다)
- Produces:
  - `export interface Route { view: ViewMode; nodeId: string | null; trackId: string | null; quizMode: QuizMode }`
  - `export interface RouteVocab { nodeIds: Set<string>; trackIds: Set<string> }`
  - `export const DEFAULT_ROUTE: Route`
  - `export function parseHash(hash: string, vocab: RouteVocab): Route`
  - `export function formatHash(route: Route): string`

- [ ] **Step 1: Write the failing test**

`src/lib/route.test.ts` 전체:

```ts
import { describe, it, expect } from 'vitest'
import { parseHash, formatHash, DEFAULT_ROUTE, type RouteVocab } from './route'

const vocab: RouteVocab = {
  nodeIds: new Set(['dsa-bigo', 'jvm-gc']),
  trackIds: new Set(['curated:junior-backend', 'domain:network']),
}

describe('parseHash', () => {
  it('maps the six top-level views', () => {
    for (const v of ['home', 'graph', 'list', 'quiz', 'path', 'guide'] as const) {
      expect(parseHash(`#/${v}`, vocab).view).toBe(v)
    }
  })

  it('treats empty and root hashes as home', () => {
    expect(parseHash('', vocab)).toEqual(DEFAULT_ROUTE)
    expect(parseHash('#', vocab)).toEqual(DEFAULT_ROUTE)
    expect(parseHash('#/', vocab)).toEqual(DEFAULT_ROUTE)
  })

  it('falls back to home for an unknown view', () => {
    expect(parseHash('#/nope/dsa-bigo', vocab)).toEqual(DEFAULT_ROUTE)
  })

  it('reads a known node id in graph and list views', () => {
    expect(parseHash('#/list/dsa-bigo', vocab).nodeId).toBe('dsa-bigo')
    expect(parseHash('#/graph/jvm-gc', vocab).nodeId).toBe('jvm-gc')
  })

  it('drops an unknown node id instead of selecting nothing-ness', () => {
    expect(parseHash('#/list/ghost', vocab).nodeId).toBeNull()
    expect(parseHash('#/list/ghost', vocab).view).toBe('list')
  })

  it('reads a track id containing a colon', () => {
    expect(parseHash('#/path/curated:junior-backend', vocab).trackId).toBe('curated:junior-backend')
    expect(parseHash('#/path/domain:network', vocab).trackId).toBe('domain:network')
  })

  it('drops an unknown track id', () => {
    expect(parseHash('#/path/curated:ghost', vocab).trackId).toBeNull()
  })

  it('defaults the quiz sub-mode to flash', () => {
    expect(parseHash('#/quiz', vocab).quizMode).toBe('flash')
    expect(parseHash('#/quiz/ghost', vocab).quizMode).toBe('flash')
    expect(parseHash('#/quiz/drill', vocab).quizMode).toBe('drill')
  })

  it('ignores trailing slashes and empty segments', () => {
    expect(parseHash('#/list//dsa-bigo/', vocab).nodeId).toBe('dsa-bigo')
    expect(parseHash('#/path/', vocab).view).toBe('path')
  })

  it('ignores a node id in views that do not carry one', () => {
    const r = parseHash('#/home/dsa-bigo', vocab)
    expect(r.view).toBe('home')
    expect(r.nodeId).toBeNull()
  })

  it('never throws', () => {
    for (const junk of ['#////', '#/%%%', '#/list/#/list', '#/quiz/drill/extra']) {
      expect(() => parseHash(junk, vocab)).not.toThrow()
    }
  })
})

describe('formatHash', () => {
  it('omits the argument segment when there is nothing selected', () => {
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'list' })).toBe('#/list')
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'path' })).toBe('#/path')
    expect(formatHash(DEFAULT_ROUTE)).toBe('#/home')
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'guide' })).toBe('#/guide')
  })

  it('always spells out the quiz sub-mode', () => {
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'quiz' })).toBe('#/quiz/flash')
    expect(formatHash({ ...DEFAULT_ROUTE, view: 'quiz', quizMode: 'review' })).toBe('#/quiz/review')
  })

  it('round-trips every shape through parseHash', () => {
    const hashes = [
      '#/home', '#/guide', '#/graph', '#/graph/jvm-gc', '#/list', '#/list/dsa-bigo',
      '#/path', '#/path/curated:junior-backend', '#/quiz/flash', '#/quiz/graph',
    ]
    for (const h of hashes) {
      expect(formatHash(parseHash(h, vocab))).toBe(h)
    }
  })

  it('normalizing is a fixed point', () => {
    for (const junk of ['', '#', '#/list/ghost', '#/quiz', '#/nope', '#/path/']) {
      const once = formatHash(parseHash(junk, vocab))
      const twice = formatHash(parseHash(once, vocab))
      expect(twice).toBe(once)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`

- [ ] **Step 3: Write minimal implementation**

`src/lib/route.ts` 전체:

```ts
import type { ViewMode, QuizMode } from '../store/graphStore'

// The app's URL grammar (hash-based, no router dependency):
//   #/home  #/guide
//   #/graph  #/graph/<nodeId>
//   #/list   #/list/<nodeId>
//   #/path/<trackId>        e.g. #/path/curated:junior-backend
//   #/quiz/<mode>           mode ∈ flash | drill | review | graph
// Segments are left unencoded on purpose: node ids are [a-z0-9-] slugs and ':'
// is legal in a fragment, so the URLs stay readable.
export interface Route {
  view: ViewMode
  nodeId: string | null
  trackId: string | null
  quizMode: QuizMode
}

// The set of ids a hash is allowed to name. Built once from graph.json by the
// caller so this module stays pure and cheap to test.
export interface RouteVocab {
  nodeIds: Set<string>
  trackIds: Set<string>
}

export const DEFAULT_ROUTE: Route = { view: 'home', nodeId: null, trackId: null, quizMode: 'flash' }

const VIEWS: readonly string[] = ['home', 'graph', 'list', 'quiz', 'path', 'guide']
const QUIZ_MODES: readonly string[] = ['flash', 'drill', 'review', 'graph']

// Total function: never throws, always returns a valid Route. Anything the
// grammar doesn't recognise degrades to the nearest valid state (unknown view
// → home, unknown id → no selection) rather than rendering a broken screen.
export function parseHash(hash: string, vocab: RouteVocab): Route {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean)
  const view = parts[0]
  const arg = parts[1]
  if (!view || !VIEWS.includes(view)) return { ...DEFAULT_ROUTE }
  const route: Route = { ...DEFAULT_ROUTE, view: view as ViewMode }
  if (view === 'graph' || view === 'list') {
    route.nodeId = arg && vocab.nodeIds.has(arg) ? arg : null
  } else if (view === 'path') {
    route.trackId = arg && vocab.trackIds.has(arg) ? arg : null
  } else if (view === 'quiz') {
    route.quizMode = arg && QUIZ_MODES.includes(arg) ? (arg as QuizMode) : 'flash'
  }
  return route
}

// Inverse of parseHash for every reachable state. formatHash(parseHash(h)) is a
// fixed point, which is what lets useUrlSync compare against location.hash to
// decide whether a push is needed.
export function formatHash(route: Route): string {
  switch (route.view) {
    case 'graph':
    case 'list':
      return route.nodeId ? `#/${route.view}/${route.nodeId}` : `#/${route.view}`
    case 'path':
      return route.trackId ? `#/path/${route.trackId}` : '#/path'
    case 'quiz':
      return `#/quiz/${route.quizMode}`
    default:
      return `#/${route.view}`
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/route.test.ts && npx tsc -b`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/route.ts src/lib/route.test.ts
git commit -m "$(cat <<'EOF'
feat(route): 해시 ↔ Route 순수 파서/포매터 추가

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `useUrlSync` — store ↔ History API 연결

`history`를 만지는 유일한 지점. 루프 방지 장치는 **해시 문자열 비교 하나뿐**이다: `popstate` 시점에 `location.hash`는 *이미* 새 값이므로, 그걸 store에 반영하면 `formatHash(state) === location.hash` 가 되어 push가 일어나지 않는다. 플래그도 ref도 필요 없다.

여기서 `useTheme.ts`의 viewMode **하이드레이트** effect도 제거한다. URL이 소스가 되어야 하는데 그 effect가 저장된 탭으로 덮어써 버리기 때문이다. 단, 해시가 비어 있을 때(맨 처음 방문 또는 `/` 접속)는 저장된 탭을 복원하던 기존 동작을 유지하기 위해 `useUrlSync`가 직접 `localStorage`를 읽는다. 저장(write) effect는 `useTheme.ts`에 그대로 둔다.

**Files:**
- Create: `src/hooks/useUrlSync.ts`
- Test: `src/hooks/useUrlSync.test.ts` (신규)
- Modify: `src/hooks/useTheme.ts` (`VIEW_KEY` export, 하이드레이트 effect 삭제)
- Modify: `src/App.tsx` (훅 호출 추가)

**Interfaces:**
- Consumes: `parseHash`, `formatHash`, `Route`, `RouteVocab` (Task 4) / store fields `viewMode`, `selectedId`, `trackId`, `quizMode` (Tasks 1–2) / `CURATED_TRACKS` from `../graph/tracks` / `buildDomainTracks(nodes, edges)` from `../lib/tracks`
- Produces: `export function useUrlSync(): void`, `export const VIEW_KEY` (from `src/hooks/useTheme.ts`, 값은 기존과 동일한 `'interview-map.viewMode.v1'`)

- [ ] **Step 1: Write the failing test**

`src/hooks/useUrlSync.test.ts` 전체. 실제 `graph.json` 기준 id를 쓴다 (`dsa-bigo` = Big-O, `curated:junior-backend` = 신입 백엔드 필수 코스).

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUrlSync } from './useUrlSync'
import { useGraphStore } from '../store/graphStore'

function setHash(h: string) {
  window.history.replaceState(null, '', h)
}

describe('useUrlSync', () => {
  beforeEach(() => {
    localStorage.clear()
    setHash('#/home')
    useGraphStore.setState({ viewMode: 'home', selectedId: null, trackId: null, quizMode: 'flash' })
  })

  it('applies the initial hash to the store', () => {
    setHash('#/list/dsa-bigo')
    renderHook(() => useUrlSync())
    const s = useGraphStore.getState()
    expect(s.viewMode).toBe('list')
    expect(s.selectedId).toBe('dsa-bigo')
  })

  it('canonicalises a non-canonical hash without adding a history entry', () => {
    setHash('#/quiz')
    const before = window.history.length
    renderHook(() => useUrlSync())
    expect(window.location.hash).toBe('#/quiz/flash')
    expect(window.history.length).toBe(before)
  })

  it('restores the saved view mode when the hash is empty', () => {
    localStorage.setItem('interview-map.viewMode.v1', 'guide')
    setHash('#')
    renderHook(() => useUrlSync())
    expect(useGraphStore.getState().viewMode).toBe('guide')
    expect(window.location.hash).toBe('#/guide')
  })

  it('pushes a history entry when the store navigates', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().openNote('dsa-bigo')
    expect(window.location.hash).toBe('#/list/dsa-bigo')
    expect(window.history.length).toBe(before + 1)
  })

  it('pushes exactly one entry per navigation', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().setViewMode('path')
    useGraphStore.getState().setTrackId('curated:junior-backend')
    expect(window.history.length).toBe(before + 2)
    expect(window.location.hash).toBe('#/path/curated:junior-backend')
  })

  it('does not push when unrelated state changes', () => {
    renderHook(() => useUrlSync())
    const before = window.history.length
    useGraphStore.getState().toggleStudied('dsa-bigo')
    expect(window.history.length).toBe(before)
  })

  it('applies popstate back to the store', () => {
    renderHook(() => useUrlSync())
    useGraphStore.getState().openNote('dsa-bigo')

    setHash('#/path/curated:junior-backend')
    window.dispatchEvent(new PopStateEvent('popstate'))

    const s = useGraphStore.getState()
    expect(s.viewMode).toBe('path')
    expect(s.trackId).toBe('curated:junior-backend')
    expect(s.selectedId).toBeNull()
  })

  it('does not push back after a popstate (no feedback loop)', () => {
    renderHook(() => useUrlSync())
    setHash('#/list/dsa-bigo')
    const before = window.history.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/list/dsa-bigo')
  })

  it('survives a double mount without duplicating entries', () => {
    setHash('#/list/dsa-bigo')
    const before = window.history.length
    const a = renderHook(() => useUrlSync())
    a.unmount()
    renderHook(() => useUrlSync())
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/list/dsa-bigo')
  })

  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => useUrlSync())
    unmount()
    const before = window.history.length
    useGraphStore.getState().setViewMode('guide')
    expect(window.history.length).toBe(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useUrlSync.test.ts`
Expected: FAIL — `Failed to resolve import "./useUrlSync"`

- [ ] **Step 3: Write minimal implementation**

`src/hooks/useUrlSync.ts` 전체:

```ts
import { useEffect } from 'react'
import graphData from '../graph/graph.json'
import type { GraphData } from '../graph/types'
import { CURATED_TRACKS } from '../graph/tracks'
import { buildDomainTracks } from '../lib/tracks'
import { parseHash, formatHash, type Route, type RouteVocab } from '../lib/route'
import { useGraphStore } from '../store/graphStore'
import { VIEW_KEY } from './useTheme'

const data = graphData as GraphData

// Built once at module load: graph.json is static and already bundled, so a
// deep link can be validated synchronously before the first paint.
const VOCAB: RouteVocab = {
  nodeIds: new Set(data.nodes.map((n) => n.id)),
  trackIds: new Set([...CURATED_TRACKS, ...buildDomainTracks(data.nodes, data.edges)].map((t) => t.id)),
}

// Which store fields ride in the URL, per view. Everything else (theme,
// progress, quiz settings) is preference state and belongs in localStorage.
function routeFromState(s: ReturnType<typeof useGraphStore.getState>): Route {
  return { view: s.viewMode, nodeId: s.selectedId, trackId: s.trackId, quizMode: s.quizMode }
}

function applyRoute(r: Route): void {
  useGraphStore.setState({
    viewMode: r.view,
    selectedId: r.nodeId,
    trackId: r.trackId,
    quizMode: r.quizMode,
    focusRequestId: null,
  })
}

// A bare visit ('' or '#') has no route to restore, so fall back to the tab the
// user was last on — the behaviour useTheme's hydrate effect used to provide.
function initialHash(): string {
  const raw = window.location.hash
  if (raw.replace(/^#\/?/, '') !== '') return raw
  const saved = localStorage.getItem(VIEW_KEY)
  return saved ? `#/${saved}` : ''
}

// Two-way bridge between the store and the browser's history. The ONLY place
// that touches window.history.
//
// Loop guard: just the string compare below. On popstate location.hash has
// already changed, so applying it to the store makes formatHash(state) equal
// location.hash and the push is skipped. No flags, no refs.
export function useUrlSync(): void {
  useEffect(() => {
    const route = parseHash(initialHash(), VOCAB)
    applyRoute(route)
    // replaceState, not push: entering the app shouldn't leave a stale entry
    // behind, and it keeps StrictMode's double-mount idempotent.
    window.history.replaceState(null, '', formatHash(route))

    const onPop = () => applyRoute(parseHash(window.location.hash, VOCAB))
    window.addEventListener('popstate', onPop)

    const unsubscribe = useGraphStore.subscribe(() => {
      const next = formatHash(routeFromState(useGraphStore.getState()))
      if (next !== window.location.hash) window.history.pushState(null, '', next)
    })

    return () => {
      window.removeEventListener('popstate', onPop)
      unsubscribe()
    }
  }, [])
}
```

`src/hooks/useTheme.ts` 수정:
- `const VIEW_KEY = 'interview-map.viewMode.v1'` → `export const VIEW_KEY = 'interview-map.viewMode.v1'`
- `useViewModeEffect` 안의 **하이드레이트 effect만** 삭제한다. 즉 아래 블록을 통째로 제거:

```ts
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === 'home' || saved === 'graph' || saved === 'list' || saved === 'quiz' || saved === 'path') setViewMode(saved)
    // hydrate once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

이 제거로 `setViewMode` 셀렉터가 안 쓰이게 되므로 `const setViewMode = useGraphStore((s) => s.setViewMode)` 줄도 삭제한다. 저장 effect(`localStorage.setItem(VIEW_KEY, viewMode)`)는 그대로 둔다. 함수 위에 주석 한 줄 추가:

```ts
// Persist the last-visited tab so a bare visit (no hash) resumes there.
// Hydration now belongs to useUrlSync — the URL outranks localStorage.
```

`src/App.tsx` 수정:
- import 추가: `import { useUrlSync } from './hooks/useUrlSync'`
- 본문에서 `useCloudSync()` 아래에 `useUrlSync()` 추가

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 전부 PASS (신규 10 tests 포함)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUrlSync.ts src/hooks/useUrlSync.test.ts src/hooks/useTheme.ts src/App.tsx
git commit -m "$(cat <<'EOF'
feat(nav): URL 해시 라우팅으로 브라우저 뒤로가기·딥링크 지원

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 실제 앱에서 검증

자동화 테스트는 jsdom이라 진짜 뒤로가기 버튼을 누르지 않는다. 실제 브라우저에서 확인한다.

**Files:** 없음 (검증 전용. 결함이 나오면 해당 태스크로 되돌아가 고친다)

- [ ] **Step 1: 전체 게이트 통과 확인**

Run: `npm test && npm run lint && npm run build`
Expected: 세 개 모두 성공. 실패하면 여기서 멈추고 고친다.

- [ ] **Step 2: 개발 서버 실행**

Run: `npm run dev`

- [ ] **Step 3: 사용자가 신고한 시나리오 확인**

1. `코스` 탭 → `신입 백엔드 필수`가 아닌 **다른 코스**(예: `면접 D-7 벼락치기`)를 고른다 → URL이 `#/path/curated:crash-7`
2. 첫 개념(Big-O 등) 클릭 → URL이 `#/list/dsa-bigo`, 노트가 열린다
3. **브라우저 뒤로가기** → `코스` 탭으로 돌아가고 **`면접 D-7 벼락치기`가 그대로 선택**되어 있다 (첫 코스로 리셋되지 않음)
4. **앞으로가기** → 다시 Big-O 노트

- [ ] **Step 4: 딥링크와 새로고침 확인**

1. 주소창에 `#/list/dsa-bigo` 직접 입력 → Big-O 노트가 바로 열린다
2. 그 상태에서 새로고침 → 같은 노트 유지
3. `#/list/존재하지-않는-id` 입력 → `목록` 탭의 빈 화면(`왼쪽 목록에서 주제를 선택하세요.`), 콘솔 에러 없음
4. `#/nope` 입력 → 홈으로 정규화되고 URL이 `#/home`

- [ ] **Step 5: 나머지 탭 확인**

1. `퀴즈` → `드릴다운` 탭 → URL `#/quiz/drill`, 뒤로가기 → `#/quiz/flash`
2. `퀴즈` → 플래시카드에서 약점 칩 클릭 → `#/path/domain:<도메인>` 으로 이동하고 해당 코스가 선택됨
3. `목록` 탭에서 트리로 개념 여러 개를 연달아 클릭 → 뒤로가기를 누를 때마다 하나씩 되짚어감
4. `지도` 탭에서 노드 클릭 → `#/graph/<id>`, 빈 곳 클릭 → `#/graph`

- [ ] **Step 6: 브라우저 콘솔에 경고/에러가 없는지 확인**

특히 React StrictMode 경고와 `Throttling navigation to prevent the browser from hanging` (push 루프의 증상) 이 없어야 한다. 이게 보이면 Task 5의 문자열 비교 가드가 깨진 것이다.

- [ ] **Step 7: 스펙 문서 상태 갱신 후 커밋**

`docs/superpowers/specs/2026-07-31-url-routing-design.md` 의 `- 상태: 승인됨 (구현 대기)` 를 `- 상태: 구현 완료 (2026-07-31)` 로 바꾼다.

```bash
git add docs/superpowers/specs/2026-07-31-url-routing-design.md
git commit -m "$(cat <<'EOF'
docs(spec): URL 라우팅 설계 상태를 구현 완료로 갱신

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 스펙 대비 커버리지

| 스펙 요구사항 | 태스크 |
|---------------|--------|
| URL 문법 (6개 view + 인자 세그먼트) | 4 |
| 파싱 폴백 표 전체 | 4 |
| 정규형 고정점 | 4 |
| `route.ts` 순수성 | 4 |
| `QuizMode` 를 store로 이동 | 1 |
| `useUrlSync` 3동작 (mount/push/popstate) | 5 |
| 루프 방지 = 문자열 비교 | 5 |
| 검증용 id 집합을 훅이 직접 구성 | 5 |
| `routeFromState` 헬퍼 | 5 |
| `trackId` 승격 + `requestTrack` 제거 | 2 |
| `quizMode` store화 | 1 |
| `openNote` 원자 액션 + 4개 호출부 | 3 |
| PathView `mobileDetail` 시딩 | 2 |
| 모든 전환이 push | 5 (테스트), 6 (수동 확인) |
| DocsView `목록` 버튼은 `select(null)` 유지 | 변경 없음 — 의도적 |
| 검증 (test/lint/build + 실제 앱) | 6 |

스펙에 없었지만 구현에 필요해 추가된 항목: `useTheme.ts`의 viewMode 하이드레이트 제거 (Task 5). URL과 localStorage가 서로 다른 탭을 주장하는 충돌을 없애기 위한 것이며, 해시가 비었을 때의 복원 동작은 `useUrlSync`가 이어받아 사용자 입장에서는 동일하다.
