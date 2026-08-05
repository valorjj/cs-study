# 내 이력 → 개념 지도: UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 완성된 이력 금고 엔진에 화면을 붙여, 사용자가 프로젝트를 등록하고 그 프로젝트에서 마주친 개념을 방사형 지도로 보고 노트로 이동할 수 있게 한다.

**Architecture:** `viewMode: 'resume'` 탭 하나가 금고 상태(`none`/`locked`/`unlocked`)에 따라 세 화면을 분기한다. 프로젝트 등록 → 마스킹 확정 → 로컬 매칭 → (선택) AI 추출 → 개념 지도 모달이 한 줄기다. 엔진(`vault`/`mask`/`conceptMatch`/`mastery`/`radial`/`extract`)은 이미 있고 **한 줄도 고치지 않는다** — 단 하나 예외는 Task 2의 마스킹 게이트로, 그건 "확정 안 된 후보가 있으면 전송 불가"를 UI가 아니라 전송 경로가 강제하게 만드는 작업이다.

**Tech Stack:** React 19, TypeScript, zustand 5, `@xyflow/react`(기존 그래프와 동일), vitest 4 + jsdom, oxlint.

**참조 스펙:** `docs/superpowers/specs/2026-08-05-resume-concept-map-design.md` (4단계 "최소 UI")
**직전 플랜:** `docs/superpowers/plans/2026-08-05-resume-concept-map-core.md` (엔진, 병합 완료)

## Global Constraints

- 작업 디렉터리는 `interview-map/`. 모든 명령은 그 안에서 실행한다.
- 테스트: `npx vitest run <path>`. 전체는 `npx vitest run`. 린트는 `npm run lint`(oxlint).
- **타입체크는 `npm run build` (= `tsc -b && vite build`) 로만 한다. `npx tsc --noEmit` 은
  절대 쓰지 말 것 — 루트 `tsconfig.json` 이 `{"files": [], "references": [...]}` 이므로
  파일 0개를 검사하고 항상 조용히 성공한다.** `npx vite build` 단독도 게이트가 아니다
  (esbuild가 타입을 검사 없이 지운다). 직전 플랜에서 이 함정 때문에 타입 오류 4건이
  13개 태스크를 통과했다.
- 커밋 메시지는 한국어 본문 + `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` 줄 포함.
- **이 저장소는 공개다.** 실제 회사명·고객명·사내 시스템명·개인 이력을 테스트 픽스처에 넣지 말 것. 가상의 "정산 서비스" 예시만 쓴다 (`src/lib/__fixtures__/settlementProject.ts` 재사용).
- 파생 암호화 키와 평문을 `localStorage`/`sessionStorage`에 절대 쓰지 않는다. 이건 store가 이미 지키고 있다 — 새 코드가 깨뜨리지 않는지가 관건이다.
- **잠긴 상태(`locked`/`none`)에서 평문이 DOM에 들어가지 않는다.** 서술문·프로젝트명 모두.
- `verbatimModuleSyntax` ON → 타입 전용 import는 `import type`.
- 컬렉션·입출력 규칙은 `CLAUDE.md`를 따른다.
- 기존 CSS 관례를 따른다: 컴포넌트마다 같은 이름의 `.css` 파일, 클래스 접두사는 컴포넌트 약자(`QuizView.css` → `.qv-*`). 테마 변수(`var(--...)`)만 쓰고 색을 하드코딩하지 않는다.
- 애니메이션·반응형·마이크로 인터랙션은 이 플랜 범위가 **아니다**(스펙 5단계).

## 범위에서 빼는 것과 그 이유

**클라우드 동기화 훅(`useResumeSync`)은 이 플랜에 없다.** `resumeCloud.ts`(클라이언트)와 `save_resume_vault` RPC(baseline 낙관적 동시성)는 이미 있지만, 이것들을 실제 로그인/로그아웃 전이와 엮는 훅은 이 기능에서 결함 밀도가 가장 높은 조각이다(게스트 blob 업로드, 원격 충돌, 다른 기기가 먼저 쓴 경우, 잠긴 상태로 동기화). UI 없이는 손으로 확인할 방법도 없다.

→ 이 플랜은 **단일 기기 + localStorage 금고**로 완결된다. 화면을 직접 만져 본 뒤 동기화를 별도 플랜으로 붙인다.

**정직한 고지:** 사용자의 원래 요구는 "어디서든 재개"였다. 이 플랜만으로는 그게 충족되지 않는다 — 기기 하나에서만 동작한다. 동기화 플랜이 남은 절반이다.

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/resumeTypes.ts` (수정) | `CandidateKind`·`MaskDecision` 추가, `Project.maskDict` → `maskDecisions` 교체 |
| `src/lib/mask.ts` (수정) | `CandidateKind` 를 resumeTypes에서 import, `maskGate()` 추가 |
| `src/lib/extractPayload.ts` (수정) | 마스킹 게이트를 전송 경로에서 강제, dict를 결정에서 파생 |
| `src/lib/route.ts` (수정) | `#/resume`·`#/resume/<projectId>` 문법 |
| `src/store/graphStore.ts` (수정) | `ViewMode` 에 `'resume'` 추가, `activeProjectId` 라우트 상태 |
| `src/store/resumeStore.ts` (수정) | 세션 UI 위치(`mapOpen`), `maskDecisions` 반영 |

> **`activeProjectId` 는 `graphStore` 에 둔다** — `selectedId`·`trackId`·`quizMode` 와 같은
> 라우트 상태이고 URL에 실린다. 금고 데이터가 아니므로 `resumeStore` 분리 이유(복호화된
> 평문과 키를 포화된 graphStore에서 떼어놓기)가 적용되지 않는다.
>
> 이걸 `resumeStore` 에 두면 `useUrlSync` 가 두 store를 같은 콜백으로 구독해야 하고,
> 그 콜백이 양쪽의 합성값을 읽는 순간 파일 헤더가 문서화한 단일구독 loop guard가
> 무효화된다 — `applyRoute` 가 두 store를 순차로 `setState` 하므로 첫 알림이 옛 값을
> 읽어 가짜 `pushState` 를 낸다. Task 1 리뷰에서 `history.length` 1→3 으로 실증됐다.
> `mapOpen` 은 URL에 실리지 않으므로 `resumeStore` 에 남는다.
| `src/lib/conceptGroups.ts` (신규) | `Match[]` + 그래프 + 숙련도 증거 → `DomainGroup[]` 어댑터 |
| `src/hooks/useSrsKeysByNode.ts` (신규) | 노트 풀에서 노드별 SRS 카드 키 맵 구성 |
| `src/components/ResumeView.tsx` + `.css` (신규) | 탭 루트. 금고 상태 분기 + 프로젝트 목록 |
| `src/components/VaultGate.tsx` (신규) | 최초 설정 / 잠금해제 화면 |
| `src/components/ProjectForm.tsx` (신규) | 등록·편집 폼 |
| `src/components/MaskPanel.tsx` (신규) | 마스킹 후보 확정 + 전송 전문 미리보기 |
| `src/components/ConceptMapModal.tsx` + `.css` (신규) | 방사형 지도 모달 + 노트 이동 |
| `src/components/ViewToggle.tsx` (수정) | `내 이력` 탭 버튼 |
| `src/App.tsx` (수정) | `viewMode === 'resume'` 렌더 |

---

### Task 1: 라우트 · 탭 · 뷰 셸

`#/resume` 로 갈 수 있고, 금고 상태에 따라 세 화면 중 하나가 뜨는 골격까지.

**Files:**
- Modify: `src/store/graphStore.ts:6` (`ViewMode`)
- Modify: `src/lib/route.ts` (`VIEWS`, `parseHash`, `formatHash`, `Route`)
- Modify: `src/hooks/useUrlSync.ts` (`routeFromState`, `applyRoute`)
- Modify: `src/components/ViewToggle.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/ResumeView.tsx`, `src/components/ResumeView.css`
- Test: `src/lib/route.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: `useResumeStore` 의 `status`·`hydrate` (기존)
- Produces: `ViewMode` 에 `'resume'`; `Route.projectId: string | null`; `ResumeView` 컴포넌트(props 없음)

- [ ] **Step 1: 실패하는 라우트 테스트 작성**

`src/lib/route.test.ts` 에 추가한다. 그 파일에는 이미 `const vocab: RouteVocab = {...}` 가 있다 — 새로 만들지 말고 그것을 쓴다.

```ts
describe('resume route', () => {
  it('parses #/resume', () => {
    expect(parseHash('#/resume', vocab)).toEqual({
      view: 'resume', nodeId: null, trackId: null, projectId: null, quizMode: 'flash',
    })
  })

  // 프로젝트 id는 금고 안에서 생성된 uuid다. 라우트 어휘(VOCAB)로 검증할 수 없다 —
  // 잠긴 상태에서는 id 목록 자체를 모르기 때문이다. 그래서 형식만 본다.
  it('parses a project segment when it looks like an id', () => {
    expect(parseHash('#/resume/7f3c2a91-0000-4000-8000-000000000001', vocab).projectId)
      .toBe('7f3c2a91-0000-4000-8000-000000000001')
  })

  it('drops a project segment that is not id-shaped', () => {
    expect(parseHash('#/resume/../etc/passwd', vocab).projectId).toBeNull()
    expect(parseHash('#/resume/<script>', vocab).projectId).toBeNull()
  })

  it('round-trips', () => {
    for (const h of ['#/resume', '#/resume/7f3c2a91-0000-4000-8000-000000000001']) {
      expect(formatHash(parseHash(h, vocab))).toBe(h)
    }
  })

  it('does not put a project id on other views', () => {
    expect(formatHash({ view: 'home', nodeId: null, trackId: null, projectId: 'x', quizMode: 'flash' }))
      .toBe('#/home')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/route.test.ts`
Expected: FAIL — `projectId` 가 `Route` 에 없다는 타입/단정 실패.

- [ ] **Step 3: 라우트 구현**

`src/lib/route.ts`:

```ts
export interface Route {
  view: ViewMode
  nodeId: string | null
  trackId: string | null
  projectId: string | null
  quizMode: QuizMode
}

export const DEFAULT_ROUTE: Route = {
  view: 'home', nodeId: null, trackId: null, projectId: null, quizMode: 'flash',
}

const VIEWS: readonly string[] = ['home', 'graph', 'list', 'quiz', 'path', 'guide', 'resume']

// 프로젝트 id는 crypto.randomUUID() 결과다. VOCAB으로 검증할 수 없다(잠긴 금고의
// id 목록을 모른다) → 형식만 확인한다. 형식 검사는 보안 장치가 아니라, 주소창에
// 손으로 넣은 쓰레기가 store에 들어가지 않게 하는 위생 장치다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

`parseHash` 의 분기에 추가:

```ts
  } else if (view === 'resume') {
    route.projectId = arg && UUID_RE.test(arg) ? arg : null
  }
```

`formatHash` 의 `switch` 에 추가:

```ts
    case 'resume':
      return route.projectId ? `#/resume/${route.projectId}` : '#/resume'
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/route.test.ts`
Expected: PASS. 기존 라우트 테스트도 전부 통과해야 한다 — `DEFAULT_ROUTE` 에 필드가
하나 늘었으므로 `toEqual` 로 전체 Route를 비교하는 기존 단정들이 깨진다면, **테스트의
기대값에 `projectId: null` 을 추가**하고 다른 것은 고치지 말 것.

- [ ] **Step 5: ViewMode·URL 동기화 배선**

`src/store/graphStore.ts:6`:

```ts
export type ViewMode = 'home' | 'graph' | 'list' | 'quiz' | 'path' | 'guide' | 'resume'
```

`src/store/graphStore.ts` — `trackId`/`setTrackId` **바로 옆에** 같은 형태로 넣는다.
라우트 상태이므로 여기가 집이다(위 File Structure의 주의 참조):

```ts
  activeProjectId: string | null            // 내 이력 탭에서 열린 프로젝트 (URL에 실린다)
  setActiveProject: (id: string | null) => void
```

```ts
  activeProjectId: null,
  setActiveProject: (id) => set({ activeProjectId: id }),
```

`src/hooks/useUrlSync.ts` — `routeFromState` 와 `applyRoute` 에 `projectId` 를 넣는다.
**두 번째 store를 구독하지 말 것.** 필드가 `graphStore` 에 있으므로 다른 라우트
필드와 똑같이 인자에서 읽고, 하나의 `setState` 안에서 쓴다 — 알림 한 번, loop
guard의 전제(한 알림 = 한 원자적 전이) 유지:

```ts
function routeFromState(s: ReturnType<typeof useGraphStore.getState>): Route {
  return {
    view: s.viewMode, nodeId: s.selectedId, trackId: s.trackId, quizMode: s.quizMode,
    projectId: s.activeProjectId,
  }
}

function applyRoute(r: Route): void {
  useGraphStore.setState({
    viewMode: r.view,
    selectedId: r.nodeId,
    trackId: r.trackId,
    // quizMode와 같은 이유로 조건부다: resume 뷰가 아닐 때 activeProjectId를 지우면,
    // 노트를 보고 돌아왔을 때 열려 있던 프로젝트를 잃는다.
    ...(r.view === 'quiz' ? { quizMode: r.quizMode } : {}),
    ...(r.view === 'resume' ? { activeProjectId: r.projectId } : {}),
    focusRequestId: null,
  })
}
```

기존 `useGraphStore.subscribe(...)` 는 **그대로 둔다.** 구독을 추가하지 않는다.

- [ ] **Step 5b: 두 상태가 함께 움직이는 경로에 테스트를 붙인다**

`src/hooks/useUrlSync.test.ts` 또는 `useUrlSync.integration.test.ts` — 이미 `popstate` 를
구동하는 쪽을 읽고 그 하네스에 맞춰 넣는다. 이 두 건은 회귀 방지다:

1. `#/resume/<idA>` → `#/resume/<idB>` 를 `popstate` 로 이동할 때 히스토리 항목이
   **늘지 않는다.** `window.history.length` 를 전후로 단정하고 최종 `location.hash` 도 본다.
2. `#/resume/<id>` → `#/list/<nodeId>` → 뒤로가기 → `#/resume/<id>` 로 돌아오고
   `activeProjectId` 가 유지된다.

1번은 `activeProjectId` 가 `resumeStore` 에 있고 `useUrlSync` 가 두 store를 구독하던
구조에서 실패한다(가짜 `pushState` 2건, `history.length` 1→3). 그 구조로 돌아가려는
어떤 변경도 이 테스트가 잡는다.

- [ ] **Step 6: 탭 버튼**

`src/components/ViewToggle.tsx` — 기존 버튼과 **완전히 같은 형태**로 하나 추가한다
(`role="tab"`, `aria-selected`, `data-active`, 아이콘 + 라벨). 아이콘은
`react-icons/lu` 의 `LuBriefcase`. 라벨은 `내 이력`. 위치는 `코스` 다음.

- [ ] **Step 7: 뷰 셸**

`src/components/ResumeView.tsx`:

```tsx
import { useEffect } from 'react'
import { useResumeStore } from '../store/resumeStore'
import './ResumeView.css'

export function ResumeView() {
  const status = useResumeStore((s) => s.status)
  const hydrate = useResumeStore((s) => s.hydrate)

  // store는 status:'none'으로 시작한다. 저장된 금고가 있는지는 localStorage를 읽어야
  // 알 수 있고, 그 읽기는 이 탭에 들어올 때 한 번이면 된다 — 다른 탭만 쓰는 사용자에게
  // 이력 기능의 존재를 알릴 필요가 없다(패스프레이즈 요구 시점 = 이 탭 진입).
  useEffect(() => { hydrate() }, [hydrate])

  return (
    <div className="rv">
      {status === 'unlocked' ? <div className="rv-list">준비 중</div> : <div className="rv-gate">준비 중</div>}
    </div>
  )
}
```

`ResumeView.css` — 기존 `PathView.css` 의 레이아웃 관례(중앙 정렬 컨테이너, `max-width`,
`padding`)를 따라 `.rv`, `.rv-list`, `.rv-gate` 최소 스타일만.

`src/App.tsx` — import 추가 후 `{viewMode === 'resume' && <ResumeView />}` 를
`{viewMode === 'guide' && <GuideView />}` 다음 줄에 넣는다.

- [ ] **Step 8: 전체 검증**

Run: `npx vitest run && npm run build && npm run lint`
Expected: 전부 통과. `npm run build` 가 진짜 타입 게이트다.

수동 확인(보고서에 적을 것): `npm run dev` 후 `#/resume` 로 이동 → 탭이 활성화되고
"준비 중"이 보이는지. 뒤로가기로 이전 탭에 돌아오는지.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/route.ts src/lib/route.test.ts src/store/graphStore.ts src/store/resumeStore.ts \
        src/hooks/useUrlSync.ts src/components/ViewToggle.tsx src/components/ResumeView.tsx \
        src/components/ResumeView.css src/App.tsx
git commit -m "feat(resume): 내 이력 탭과 #/resume 라우트 추가"
```

---

### Task 2: 마스킹 결정 데이터 모델 + 전송 게이트

이 태스크가 이 플랜에서 **가장 중요하다.** "모든 후보를 결정해야 전송된다"는 규칙을 UI가 아니라 전송 경로가 강제하게 만든다. 버튼 `disabled` 로만 막으면 그 버튼을 우회하는 다음 코드가 생길 때 조용히 뚫린다 — 직전 플랜에서 같은 형태의 결함이 9건 나왔다.

**Files:**
- Modify: `src/lib/resumeTypes.ts`
- Modify: `src/lib/mask.ts`
- Modify: `src/lib/extractPayload.ts`
- Modify: `src/lib/__fixtures__/settlementProject.ts`
- Test: `src/lib/mask.test.ts` (추가), `src/lib/extractPayload.test.ts` (추가·수정)

**Interfaces:**
- Produces:
  - `MaskDecision { text: string; kind: CandidateKind; mask: boolean }`
  - `Project.maskDecisions: MaskDecision[]` (`Project.maskDict` **삭제**)
  - `maskGate(narrative: string, decisions: MaskDecision[], neverMask: Set<string>): { ready: boolean; undecided: Candidate[] }`
  - `dictOf(decisions: MaskDecision[]): Record<string, string>`
- Consumes: 기존 `findCandidates`, `buildMaskDict`, `buildNeverMask`, `applyMask`

**왜 `maskDict` 를 지우는가:** 사전은 결정 목록에서 유도되는 값이다. 둘을 함께 저장하면
언젠가 어긋나고(서술문을 고쳐 새 후보가 생겼는데 사전은 옛것), 어긋난 쪽이 전송된다.
저장은 결정만, 사전은 항상 파생. 아직 배포된 적 없는 기능이라 마이그레이션은 없다.

- [ ] **Step 1: 실패하는 게이트 테스트 작성**

`src/lib/mask.test.ts` 에 추가:

```ts
import { maskGate, dictOf, buildNeverMask } from './mask'
import type { MaskDecision } from './resumeTypes'

describe('maskGate', () => {
  const neverMask = new Set<string>(['redis'])

  it('is ready when there are no candidates at all', () => {
    expect(maskGate('평범한 문장입니다', [], neverMask)).toEqual({ ready: true, undecided: [] })
  })

  it('is NOT ready when a candidate has no decision', () => {
    const g = maskGate('(주)정산 에서 일했다', [], neverMask)
    expect(g.ready).toBe(false)
    expect(g.undecided.map((c) => c.text)).toEqual(['정산'])
  })

  // "가리지 않는다"도 결정이다. 결정을 내렸으면 통과해야 한다 — 아니면 사용자가
  // 남기고 싶은 단어 하나 때문에 기능 전체가 영구히 막힌다.
  it('is ready when every candidate is decided, including mask:false', () => {
    const d: MaskDecision[] = [{ text: '정산', kind: 'company', mask: false }]
    expect(maskGate('(주)정산 에서 일했다', d, neverMask).ready).toBe(true)
  })

  // 서술문을 고쳐 새 후보가 생기면 다시 막혀야 한다. 이게 사전을 저장하지 않는 이유다.
  it('blocks again when an edit introduces a new candidate', () => {
    const d: MaskDecision[] = [{ text: '정산', kind: 'company', mask: true }]
    const g = maskGate('(주)정산 과 (주)물류 에서 일했다', d, neverMask)
    expect(g.ready).toBe(false)
    expect(g.undecided.map((c) => c.text)).toEqual(['물류'])
  })

  it('ignores stale decisions for text no longer in the narrative', () => {
    const d: MaskDecision[] = [{ text: '옛회사', kind: 'company', mask: true }]
    expect(maskGate('평범한 문장입니다', d, neverMask).ready).toBe(true)
  })
})

describe('dictOf', () => {
  it('includes only the decisions marked mask', () => {
    expect(dictOf([
      { text: 'SettleHub', kind: 'system', mask: true },
      { text: 'Redis', kind: 'system', mask: false },
    ])).toEqual({ SettleHub: '[SYSTEM_1]' })
  })

  it('numbers per kind in decision order, deterministically', () => {
    const d: MaskDecision[] = [
      { text: 'A', kind: 'company', mask: true },
      { text: 'B', kind: 'system', mask: true },
      { text: 'C', kind: 'company', mask: true },
    ]
    expect(dictOf(d)).toEqual({ A: '[COMPANY_1]', B: '[SYSTEM_1]', C: '[COMPANY_2]' })
  })

  // 빈 text는 new RegExp('', 'g')가 되어 모든 위치에 매칭된다 — payload 전체가
  // 토큰으로 도배되고, assertNoPlaintext는 빈 키를 건너뛰므로 침묵한다.
  it('drops an empty or whitespace-only text', () => {
    expect(dictOf([
      { text: '정산', kind: 'company', mask: true },
      { text: '', kind: 'company', mask: true },
      { text: '   ', kind: 'system', mask: true },
    ])).toEqual({ 정산: '[COMPANY_1]' })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/mask.test.ts`
Expected: FAIL — `maskGate`/`dictOf` 가 없다.

- [ ] **Step 3: 타입 이동**

`src/lib/resumeTypes.ts`:

```ts
// mask.ts가 아니라 여기 둔다 — Project가 이 타입을 쓰므로, 반대 방향이면
// resumeTypes → mask 의존이 생겨 타입 경계 파일의 목적이 깨진다.
export type CandidateKind = 'company' | 'system' | 'person' | 'contact'

// 후보 하나에 대한 사용자의 결정. mask:false 도 결정이다 — "아직 안 봤다"와
// "보고 남기기로 했다"를 구분해야 전송 게이트가 성립한다.
export interface MaskDecision {
  text: string
  kind: CandidateKind
  mask: boolean
}
```

`Project` 인터페이스에서 `maskDict` 줄을 지우고 대신:

```ts
  maskDecisions: MaskDecision[]      // 마스킹 후보별 결정. 사전은 여기서 파생한다
```

`src/lib/mask.ts` 상단 — 자기 선언을 지우고 import + 재수출(기존 import 경로 유지):

```ts
import type { CandidateKind, MaskDecision } from './resumeTypes'
export type { CandidateKind }
```

- [ ] **Step 4: 게이트 구현**

`src/lib/mask.ts` 끝에 추가:

```ts
// 결정 목록에서 사전을 파생한다. 저장된 사전은 없다 — 서술문이 바뀌면 후보가 바뀌고,
// 저장된 사전은 그 순간 낡는다. 순서가 같으면 결과가 같으므로 렌더마다 안전하다.
export function dictOf(decisions: MaskDecision[]): Record<string, string> {
  return buildMaskDict(decisions.filter((d) => d.mask).map((d) => ({
    text: d.text, kind: d.kind, count: 1,
  })))
}

export interface MaskGateResult {
  ready: boolean
  undecided: Candidate[]
}

// 지금 서술문에서 발견되는 모든 후보에 결정이 있는지 본다. 서술문에 더 이상 없는
// 결정(낡은 것)은 무시한다 — 사용자가 문장을 지웠으면 그 결정도 의미가 없다.
export function maskGate(
  narrative: string,
  decisions: MaskDecision[],
  neverMask: Set<string>,
): MaskGateResult {
  const decided = new Set(decisions.map((d) => d.text))
  const undecided = findCandidates(narrative, neverMask).filter((c) => !decided.has(c.text))
  return { ready: undecided.length === 0, undecided }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/lib/mask.test.ts`
Expected: PASS.

- [ ] **Step 6: 전송 경로에서 게이트를 강제하는 실패 테스트**

`src/lib/extractPayload.test.ts` 에 추가한다. 기존 픽스처가 `maskDict` 를 쓰고 있으므로
**같은 커밋에서 `maskDecisions` 로 바꿔야 한다** — 기존 단정의 의미는 바꾸지 말고
필드만 옮길 것.

```ts
describe('buildExtractPayload mask gate', () => {
  it('refuses to build when a candidate has no decision', () => {
    const p: Project = { ...project, narrative: '(주)정산 에서 일했다', maskDecisions: [] }
    expect(() => buildExtractPayload(p, nodes)).toThrow(/결정되지 않은/)
  })

  it('builds once every candidate is decided', () => {
    const p: Project = {
      ...project,
      narrative: '(주)정산 에서 일했다',
      maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    }
    expect(buildExtractPayload(p, nodes).maskedNarrative).toContain('[COMPANY_1]')
  })

  // 게이트가 UI 예절이 아니라 경로의 일부라는 것. requestExtract는 payload를 받지
  // 않고 직접 만들므로(직전 플랜), 게이트를 우회할 수 있는 호출자가 없다.
  it('is enforced on the wire path too', async () => {
    const p: Project = { ...project, narrative: '(주)정산 에서 일했다', maskDecisions: [] }
    await expect(requestExtract(p, nodes)).rejects.toThrow(/결정되지 않은/)
  })
})
```

마지막 테스트는 `src/lib/extract.test.ts` 에 두는 게 맞다(`requestExtract` 소유 파일).
그 파일에는 `vi.mock('./supabase', () => ({ supabase: null }))` 가 이미 있고, 게이트는
`!supabase` 확인보다 앞에서 도는 구조이므로 통과한다.

- [ ] **Step 7: 실패 확인**

Run: `npx vitest run src/lib/extractPayload.test.ts src/lib/extract.test.ts`
Expected: FAIL — 게이트가 없어 throw하지 않는다.

- [ ] **Step 8: 게이트 배선**

`src/lib/extractPayload.ts`:

```ts
import { applyMask, buildNeverMask, dictOf, maskGate } from './mask'
```

`buildExtractPayload` 를 이렇게 바꾼다:

```ts
export function buildExtractPayload(project: Project, nodes: GraphNode[]): ExtractPayload {
  // 게이트가 먼저다. 결정되지 않은 후보가 하나라도 있으면 payload를 만들지 않는다.
  // UI의 disabled 속성이 아니라 이 검사가 규칙이다 — 버튼을 우회하는 다음 코드가
  // 생겨도 여기서 막힌다.
  const neverMask = buildNeverMask(nodes)
  const gate = maskGate(project.narrative, project.maskDecisions, neverMask)
  if (!gate.ready) {
    throw new Error(
      `마스킹 여부가 결정되지 않은 후보가 ${gate.undecided.length}개 있어 전송을 중단했습니다: ` +
      gate.undecided.map((c) => c.text).join(', '),
    )
  }

  const dict = dictOf(project.maskDecisions)
  const payload: ExtractPayload = {
    maskedNarrative: applyMask(project.narrative, dict),
    stack: project.stack,
    lifecycle: project.lifecycle,
    catalog: nodes
      .filter((n) => n.level !== 0)
      .map((n) => ({ id: n.id, label: n.label, keywords: n.keywords })),
  }
  assertNoPlaintext(payload, dict)
  return payload
}
```

`assertNoPlaintext` 의 두 번째 인자를 `project.maskDict` 에서 파생 사전으로 바꾼 것이
핵심이다. 나머지 함수 시그니처는 건드리지 않는다.

**게이트를 넣으면 평문 스캔의 배선 테스트가 사라진다 — 반드시 복구하라.** 기존
"마스킹이 깨진" 테스트들은 항등 사전(`{X: 'X'}`)으로 잔존 평문을 만들었는데, 사전이
`dictOf` 파생이 되면 그런 사전을 만들 수 없다. 그 테스트들을 게이트 실패로 바꾸면
`assertNoPlaintext` 호출을 지워도 전 스위트가 초록이 된다 — 두 예외 메시지가 모두
`전송을 중단했습니다` 로 끝나서 느슨한 정규식이 구분하지 못한다.

치환 토큰의 부분문자열인 결정 텍스트로 진짜 잔존 케이스를 만든다:

```ts
it('still catches residual plaintext after the gate passes', () => {
  // 게이트는 통과한다 — findCandidates의 \b[A-Z]{3,}\b 는 밑줄을 넘지 못해
  // 'COMPANY_1' 을 후보로 제안하지 않는다. 그런데 치환 결과에 키가 그대로 남는다.
  const p: Project = {
    ...project,
    narrative: 'COMPANY_1 시스템을 썼다',
    maskDecisions: [{ text: 'COMPANY_1', kind: 'company', mask: true }],
  }
  // 게이트가 아니라 스캔이 잡았다는 것까지 단정한다. `전송을 중단` 만 보면 둘이 구분되지 않는다.
  expect(() => buildExtractPayload(p, nodes)).toThrow(/마스킹되지 않은 원문이 남아 있어/)
})
```

이 테스트는 `assertNoPlaintext(payload, dict)` 줄을 주석 처리하면 **실패해야 한다.**
직접 주석 처리해 실패를 확인하고 되돌린 출력을 보고서에 남긴다.

- [ ] **Step 8b: 마스킹의 대소문자 구멍을 닫는다**

`mask: true` 인 용어가 표기만 다르면 그대로 전송된다:

```
narrative: 'SettleHub 배치. settlehub 대시보드.'
decisions: [{ text: 'SettleHub', kind: 'system', mask: true }]
→ '[SYSTEM_1] 배치. settlehub 대시보드.'
```

`findCandidates` 는 CamelCase/ALLCAPS만 제안하므로 `settlehub` 는 후보로도 안 뜨고,
`applyMask` 의 정규식은 대소문자를 구분하며, `assertNoPlaintext` 는 정확한 키를 찾는다.
URL·호스트명·소문자 산문에서 실제로 일어난다.

- `applyMask`: 치환을 `'gi'` 로. 긴 키 우선 정렬은 유지한다(`Settle` 이 `SettleHub` 를
  반쪽만 갈아먹는 것을 막는 가드).
- `assertNoPlaintext`: 원문형과 이스케이프형 **둘 다** 대소문자를 접어 비교한다.
  건초와 바늘을 함께 접어야 한다 — 한쪽만 접으면 아무것도 안 잡힌다.

- [ ] **Step 9: 픽스처 갱신**

`src/lib/__fixtures__/settlementProject.ts` 와 `src/lib/extract*.test.ts`,
`src/lib/extractPayload.test.ts`, `src/lib/conceptMatch.golden.test.ts` 에서
`maskDict: { X: '[Y]' }` 를 `maskDecisions: [{ text: 'X', kind: '...', mask: true }]` 로
바꾼다. **단정의 기대값은 바꾸지 말 것** — 파생 사전이 같은 토큰을 만들어야 정상이다.
바뀐다면 `dictOf` 의 순서 처리가 틀린 것이다.

주의: `kind` 에 따라 토큰 접두사가 달라진다(`COMPANY`/`SYSTEM`/`PERSON`/`CONTACT`).
기존 기대값이 `[SYSTEM_1]` 이면 `kind: 'system'` 을 써야 한다.

- [ ] **Step 10: 전체 검증**

Run: `npx vitest run && npm run build && npm run lint`
Expected: 전부 통과.

- [ ] **Step 11: 커밋**

```bash
git add src/lib/resumeTypes.ts src/lib/mask.ts src/lib/mask.test.ts src/lib/extractPayload.ts \
        src/lib/extractPayload.test.ts src/lib/extract.test.ts src/lib/__fixtures__ \
        src/lib/conceptMatch.golden.test.ts
git commit -m "feat(resume): 마스킹 결정 모델 + 전송 경로가 강제하는 확정 게이트"
```

---

### Task 3: 금고 화면 (최초 설정 / 잠금해제 / 잠그기 / 내보내기)

**Files:**
- Create: `src/components/VaultGate.tsx`
- Modify: `src/components/ResumeView.tsx`, `src/components/ResumeView.css`
- Test: `src/components/VaultGate.test.tsx`

**Interfaces:**
- Consumes: `useResumeStore` 의 `status`·`error`·`createVault`·`unlock`·`lock`·`exportPlain`·`destroyVault`
- Produces: `VaultGate` (props 없음)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/VaultGate.test.tsx`. 기존 `QuizView.test.tsx` 의 렌더 헬퍼·store 초기화
패턴을 먼저 읽고 그대로 따를 것.

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VaultGate } from './VaultGate'
import { useResumeStore, RESUME_KEY } from '../store/resumeStore'

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState({ status: 'none', salt: null, sealed: null, key: null, projects: [], error: null })
})

describe('VaultGate — status none', () => {
  it('warns that a lost passphrase cannot be recovered', () => {
    render(<VaultGate />)
    expect(screen.getByText(/복구할 수 없습니다/)).toBeTruthy()
  })

  it('refuses to create a vault when the two entries differ', () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'typo' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    expect(screen.getByText(/일치하지 않습니다/)).toBeTruthy()
    expect(useResumeStore.getState().status).toBe('none')
  })

  // 짧은 패스프레이즈는 PBKDF2 200k로도 무력하다. 막지 않으면 사용자는 '1234'를 쓴다.
  //
  // **렌더된 메시지를 단정해야 한다.** `status`만 보면 어떤 구현에서도 통과한다 —
  // createVault는 deriveKey를 await하기 전에 상태를 건드리지 않으므로, 완벽히 유효한
  // 패스프레이즈로 클릭한 직후에도 status는 동기적으로 'none'이다.
  it('requires a minimum length', () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    expect(screen.getByText(/최소 12자/)).toBeTruthy()
    expect(useResumeStore.getState().status).toBe('none')
  })

  // 키 파생이 200k 반복이라 눈에 보이게 느리다. 두 번 눌리면 두 번 돈다.
  it('does not derive a second key on a double submit', async () => { /* 스파이로 호출 1회 확인, 버튼과 Enter 둘 다 */ })

  // finally 블록을 지워도 스위트가 통과하면 안 된다 — 이 파일에서 가장 보안 민감한 줄이다.
  it('clears both fields after submit, success or failure', async () => { /* 양쪽 경로 '' 확인 */ })

  it('shows a message when createVault throws', async () => {
    // crypto.subtle을 쓸 수 없는 환경(비-secure context)에서 deriveKey가 throw한다.
    // 메시지가 없으면 입력만 비워지고 사용자는 성공과 실패를 구분할 수 없다.
  })

  it('creates the vault on a matching entry', async () => {
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('패스프레이즈 확인'), { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByRole('button', { name: /금고 만들기/ }))
    await waitFor(() => expect(useResumeStore.getState().status).toBe('unlocked'))
  })
})

describe('VaultGate — status locked', () => {
  it('shows the store error when the passphrase is wrong', async () => {
    // 실제 금고를 하나 만들고 잠근다 — 가짜 blob은 GCM 검증을 통과할 수 없어
    // "틀린 패스프레이즈" 경로를 진짜로 지나가지 못한다.
    await useResumeStore.getState().createVault('correct horse battery')
    useResumeStore.getState().lock()
    render(<VaultGate />)
    fireEvent.change(screen.getByLabelText('패스프레이즈'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /열기/ }))
    await waitFor(() => expect(screen.getByText(/패스프레이즈가 다릅니다/)).toBeTruthy())
    expect(useResumeStore.getState().status).toBe('locked')
  })

  it('does not render any plaintext while locked', async () => {
    await useResumeStore.getState().createVault('correct horse battery')
    await useResumeStore.getState().upsertProject({
      id: '7f3c2a91-0000-4000-8000-000000000001', name: '비밀프로젝트명', period: '2025',
      role: 'backend', stack: [], lifecycle: [], narrative: '비밀서술문',
      maskDecisions: [], matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
    })
    useResumeStore.getState().lock()
    const { container } = render(<VaultGate />)
    // innerHTML이다. textContent는 title·aria-label·value·placeholder·data-* 를 보지
    // 않는다 — 이 단정이 플랜의 하드 제약("잠긴 상태에서 평문이 DOM에 들어가지
    // 않는다")을 지키는 유일한 장치이므로 속성까지 봐야 한다.
    expect(container.innerHTML).not.toContain('비밀프로젝트명')
    expect(container.innerHTML).not.toContain('비밀서술문')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/VaultGate.test.tsx`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`src/components/VaultGate.tsx`. 요구사항:

- `status === 'none'`: 패스프레이즈 2회 입력(`<label>` 로 `패스프레이즈` / `패스프레이즈 확인`,
  `type="password"`), `금고 만들기` 버튼. 불일치·길이부족(**최소 12자**)은 로컬 상태
  메시지로 표시하고 store를 부르지 않는다. 화면에 다음 고지를 고정 텍스트로 둔다:
  `패스프레이즈를 잊으면 저장된 이력을 복구할 수 없습니다. 복구 경로를 만들면 누군가 키를 대신 갖는다는 뜻이라, 만들지 않았습니다.`
- `status === 'locked'`: 패스프레이즈 1회 입력 + `열기` 버튼. `store.error` 를 그대로 표시.
- 두 화면 모두 `<form onSubmit>` 으로 감싸 Enter 키가 동작하게 한다. `e.preventDefault()`.
- 제출 중에는 버튼을 `disabled` — PBKDF2 200k는 눈에 보이게 느리고, 두 번 눌리면
  키 파생이 두 번 돈다.
- `status === 'unlocked'` 이면 아무것도 렌더하지 않는다(`return null`). 분기 책임은
  `ResumeView` 에 있지만, 이 컴포넌트가 단독으로 안전해야 한다.
- 입력값을 store나 어떤 전역에도 넣지 않는다. `useState` 로컬에만 두고 제출 후 `''` 로 비운다.

`ResumeView.tsx` 의 `status !== 'unlocked'` 분기를 `<VaultGate />` 로 교체.
`unlocked` 분기에는 `잠그기` 버튼(`lock()`)과 `평문 JSON 내보내기` 버튼을 둔다.
내보내기는 `exportPlain()` 결과를 `Blob` + `URL.createObjectURL` 로 다운로드시키고,
`URL.revokeObjectURL` 로 정리한다. 버튼 옆에 `이 파일은 암호화되어 있지 않습니다` 를 적는다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/VaultGate.test.tsx`
Expected: PASS (8건).

- [ ] **Step 5: 전체 검증 + 커밋**

Run: `npx vitest run && npm run build && npm run lint`

```bash
git add src/components/VaultGate.tsx src/components/VaultGate.test.tsx \
        src/components/ResumeView.tsx src/components/ResumeView.css
git commit -m "feat(resume): 금고 최초 설정·잠금해제 화면과 평문 내보내기"
```

---

### Task 4: 프로젝트 등록·편집 폼

**Files:**
- Create: `src/components/ProjectForm.tsx`
- Modify: `src/components/ResumeView.tsx`, `src/components/ResumeView.css`
- Test: `src/components/ProjectForm.test.tsx`

**Interfaces:**
- Consumes: `useResumeStore.upsertProject`, `STAGES`·`STAGE_LABELS`·`Project` (resumeTypes), `matchLocal` (conceptMatch)
- Produces: `ProjectForm({ project, nodes, onDone })` — `project` 가 `null` 이면 신규

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
describe('ProjectForm', () => {
  it('requires a name and a narrative', () => {
    render(<ProjectForm project={null} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    expect(useResumeStore.getState().projects).toHaveLength(0)
  })

  it('saves a new project with a generated id and runs local matching', async () => {
    const onDone = vi.fn()
    render(<ProjectForm project={null} nodes={nodes} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '정산 서비스' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects).toHaveLength(1))
    const p = useResumeStore.getState().projects[0]
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(p.matches.some((m) => m.nodeId === 'db-nosql')).toBe(true)
    expect(onDone).toHaveBeenCalled()
  })

  it('adds and removes stack chips', () => {
    render(<ProjectForm project={null} nodes={nodes} onDone={vi.fn()} />)
    const input = screen.getByLabelText('기술스택')
    fireEvent.change(input, { target: { value: 'Redis' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Redis')).toBeTruthy()
    // 중복은 무시한다 — 칩이 두 개가 되면 matchLocal이 같은 노드를 두 번 본다.
    fireEvent.change(input, { target: { value: 'Redis' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getAllByText('Redis')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Redis 삭제' }))
    expect(screen.queryByText('Redis')).toBeNull()
  })

  it('toggles lifecycle stages', async () => {
    render(<ProjectForm project={null} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: 'p' } })
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: '한 일' } })
    fireEvent.click(screen.getByLabelText('트랜잭션 관리'))
    fireEvent.click(screen.getByLabelText('CI/CD'))
    fireEvent.click(screen.getByLabelText('CI/CD'))          // 껐다
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects).toHaveLength(1))
    expect(useResumeStore.getState().projects[0].lifecycle).toEqual(['tx'])
  })

  // 편집은 id를 보존해야 한다 — 새 id를 주면 같은 프로젝트가 두 개가 된다.
  it('preserves the id when editing', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000001', name: '옛이름', period: '2025', role: 'backend',
      stack: [], lifecycle: [], narrative: '한 일', maskDecisions: [], matches: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('프로젝트 이름'), { target: { value: '새이름' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(useResumeStore.getState().projects[0].name).toBe('새이름'))
    expect(useResumeStore.getState().projects).toHaveLength(1)
    expect(useResumeStore.getState().projects[0].id).toBe(existing.id)
    expect(useResumeStore.getState().projects[0].updatedAt).not.toBe(existing.updatedAt)
  })

  // 서술문을 고치면 매칭도 다시 돌아야 한다. 안 돌면 지도가 옛 문장을 반영한다.
  it('re-runs matching when the narrative changes', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000002', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '아무 기술도 없는 문장',
      maskDecisions: [], matches: [], updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].matches.some((m) => m.nodeId === 'db-nosql'))
        .toBe(true))
  })

  // 회귀 방지. via:'llm' 매칭은 서술문에 이름이 없는 개념이라 로컬 재매칭으로
  // 복원할 수 없다 — 로컬 결과로 덮어쓰면 AI 추출 결과가 편집 한 번에 사라진다.
  it('keeps existing llm matches when re-running local matching', async () => {
    const existing: Project = {
      id: '7f3c2a91-0000-4000-8000-000000000003', name: 'p', period: '', role: '',
      stack: [], lifecycle: [], narrative: '중복 결제가 있었다', maskDecisions: [],
      matches: [{ nodeId: 'db-isolation', via: 'llm', evidence: '중복 결제는 격리수준 문제다' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    useResumeStore.setState({ projects: [existing] })
    render(<ProjectForm project={existing} nodes={nodes} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('한 일'), { target: { value: 'Redis 캐시를 붙였다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => {
      const m = useResumeStore.getState().projects[0].matches
      expect(m.some((x) => x.nodeId === 'db-nosql')).toBe(true)
      expect(m.find((x) => x.nodeId === 'db-isolation')?.via).toBe('llm')
    })
  })
})
```

`nodes` 픽스처는 `src/lib/conceptMatch.test.ts` 의 `node()` 헬퍼와 같은 형태로 만들고,
최소한 `db-nosql`(keywords에 `Redis`)과 `db-isolation` 을 포함한다. `db-isolation` 은
서술문에 이름이 없어 로컬 매칭에 걸리지 않아야 마지막 테스트가 의미를 갖는다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/ProjectForm.test.tsx` → FAIL.

- [ ] **Step 3: 구현**

필드: `프로젝트 이름`(text), `기간`(text, 자유형식), `역할`(text), `기술스택`(칩 입력),
`담당 단계`(`STAGES` 8개 체크박스, 라벨은 `STAGE_LABELS`), `한 일`(textarea, 서술문).

칩 입력: `<input>` + Enter 로 추가, 중복은 무시, 각 칩에 `삭제` 버튼(`aria-label`).
자동완성은 이 플랜 범위가 아니다(5단계).

저장:

```tsx
const submit = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!name.trim() || !narrative.trim()) { setLocalError('이름과 한 일은 비워둘 수 없습니다.'); return }

  // 로컬 매칭은 저장 때 한 번 돈다. 렌더마다 돌리면 122노드 × 서술문을 매 타이핑마다
  // 훑는다.
  const local = matchLocal({ stack, narrative }, nodes)
  // llm 매칭은 서술문에 이름이 없는 개념이라 로컬 재실행으로 복원되지 않는다.
  // 로컬 결과로 덮어쓰면 AI 추출 결과가 편집 한 번에 영구히 사라진다.
  const keptLlm = (project?.matches ?? []).filter((m) => m.via === 'llm')
  const seen = new Set(local.map((m) => m.nodeId))
  const matches = [...local, ...keptLlm.filter((m) => !seen.has(m.nodeId))]

  await upsertProject({
    id: project?.id ?? crypto.randomUUID(),
    name: name.trim(), period: period.trim(), role: role.trim(),
    stack, lifecycle,
    narrative,
    // 서술문이 바뀌면 후보가 바뀐다. 기존 결정 중 지금 서술문에도 있는 것만 남긴다 —
    // 낡은 결정을 들고 있어도 maskGate가 무시하지만, 저장 데이터를 깨끗하게 둔다.
    maskDecisions: project?.maskDecisions ?? [],
    matches,
    updatedAt: new Date().toISOString(),
  })
  onDone()
}
```

`ResumeView` 의 `unlocked` 분기: 프로젝트 목록(이름·기간·매칭 개수·`편집`·`삭제`·
`개념 지도` 버튼) + `새 프로젝트` 버튼. 폼은 로컬 상태로 열고 닫는다.

- [ ] **Step 4: 통과 확인 + 전체 검증**

Run: `npx vitest run && npm run build && npm run lint`

- [ ] **Step 5: 커밋**

```bash
git add src/components/ProjectForm.tsx src/components/ProjectForm.test.tsx \
        src/components/ResumeView.tsx src/components/ResumeView.css
git commit -m "feat(resume): 프로젝트 등록·편집 폼과 목록"
```

---

### Task 5: 마스킹 확정 패널 + 전송 전문 미리보기

**Files:**
- Create: `src/components/MaskPanel.tsx`
- Modify: `src/components/ResumeView.tsx`
- Test: `src/components/MaskPanel.test.tsx`

**Interfaces:**
- Consumes: `findCandidates`·`buildNeverMask`·`maskGate`·`dictOf` (mask), `buildExtractPayload` (extractPayload), `useResumeStore.upsertProject`
- Produces: `MaskPanel({ project, nodes })`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// 서술문에 회사 마커 하나(가려야 함)와 기술 용어 하나(never-mask)를 함께 넣는다.
const project: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: 'p', period: '', role: '',
  stack: [], lifecycle: [],
  narrative: '(주)정산 에서 Redis 캐시를 붙였다',
  maskDecisions: [], matches: [], updatedAt: '2026-08-06T00:00:00.000Z',
}

beforeEach(() => {
  localStorage.clear()
  useResumeStore.setState({ status: 'unlocked', projects: [project], error: null })
})

describe('MaskPanel', () => {
  it('lists the undecided candidate but not a technical term', () => {
    render(<MaskPanel project={project} nodes={nodes} />)
    expect(screen.getByText('정산')).toBeTruthy()
    // Redis가 후보로 뜨면 사용자가 그것을 가릴 수 있고, 가리면 추출 신호가 사라진다.
    expect(screen.queryByText('Redis')).toBeNull()
  })

  it('records a mask decision and a keep decision distinctly', async () => {
    render(<MaskPanel project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '정산 가리기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions)
        .toEqual([{ text: '정산', kind: 'company', mask: true }]))

    useResumeStore.setState({ projects: [project] })
    render(<MaskPanel project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '정산 남기기' }))
    await waitFor(() =>
      expect(useResumeStore.getState().projects[0].maskDecisions[0].mask).toBe(false))
  })

  // 미리보기는 buildExtractPayload의 결과를 그대로 렌더한다. 별도 조립을 하면
  // 언젠가 둘이 갈라지고, 그때 미리보기는 거짓 안전감만 주는 장식이 된다.
  it('shows the exact text that would be sent', () => {
    const decided: Project = {
      ...project, maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    }
    render(<MaskPanel project={decided} nodes={nodes} />)
    const shown = screen.getByTestId('mask-preview').textContent ?? ''
    expect(shown).toBe(buildExtractPayload(decided, nodes).maskedNarrative)
    expect(shown).toContain('[COMPANY_1]')
    expect(shown).toContain('Redis')     // 기술 용어는 그대로 나간다
  })

  it('shows why the preview is unavailable while a candidate is undecided', () => {
    render(<MaskPanel project={project} nodes={nodes} />)
    expect(screen.queryByTestId('mask-preview')).toBeNull()
    expect(screen.getByText(/결정되지 않은/)).toBeTruthy()
  })

  it('never renders the raw masked term once it is masked', () => {
    const decided: Project = {
      ...project, maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
    }
    const { container } = render(<MaskPanel project={decided} nodes={nodes} />)
    // 미리보기 안에 원문이 남아 있으면 마스킹이 새는 것이다. 결정 목록에는
    // 원문이 보여야 하므로(사용자가 무엇을 가렸는지 알아야 한다) 미리보기만 본다.
    expect(screen.getByTestId('mask-preview').textContent).not.toContain('정산')
    expect(container.textContent).toContain('정산')   // 결정 목록에는 있다
  })
})
```

`mask-preview` 는 `data-testid` 다. 미리보기 전문을 담은 `<pre>` 에 붙인다 — 텍스트
내용을 정확히 비교해야 하므로 역할·라벨로 찾기 어렵다.

- [ ] **Step 2: 실패 확인** → FAIL.

- [ ] **Step 3: 구현**

```tsx
const neverMask = useMemo(() => buildNeverMask(nodes), [nodes])
const gate = useMemo(
  () => maskGate(project.narrative, project.maskDecisions, neverMask),
  [project.narrative, project.maskDecisions, neverMask],
)

// 미리보기는 전송 경로 그 자체를 부른다. 별도 조립을 하면 언젠가 둘이 갈라진다.
// throw는 실패가 아니라 정보다 — 왜 아직 보낼 수 없는지가 곧 메시지다.
const preview = useMemo(() => {
  try { return { ok: true as const, payload: buildExtractPayload(project, nodes) } }
  catch (e) { return { ok: false as const, message: e instanceof Error ? e.message : String(e) } }
}, [project, nodes])
```

- 미결정 후보마다 `가리기` / `남기기` 버튼. 누르면
  `upsertProject({ ...project, maskDecisions: [...project.maskDecisions, { text, kind, mask }] })`.
- 이미 결정된 것은 별도 목록에 토큰(`[COMPANY_1]`)과 함께 보여주고 `되돌리기` 를 둔다.
- `preview.ok` 면 `<pre>` 로 `payload.maskedNarrative` 전문 + 칩·단계·개념 목록 개수를
  보여준다. 아니면 `preview.message` 를 그대로 보여준다.
- 전문 미리보기는 접기(`<details>`) 안에 두되 **기본 열림**(`open`) — 접혀 있으면 아무도 안 본다.

- [ ] **Step 4: 통과 확인 + 전체 검증 + 커밋**

```bash
git add src/components/MaskPanel.tsx src/components/MaskPanel.test.tsx src/components/ResumeView.tsx
git commit -m "feat(resume): 마스킹 확정 패널과 전송 전문 미리보기"
```

---

### Task 6: 숙련도 증거 수집 + 도메인 그룹 어댑터

`Match[]` 는 노드 id 목록이고 `layoutRadial` 은 `DomainGroup[]` 을 원한다. 그 사이를 잇는다. `mastery.tierOf` 는 `srsKeysByNode` 를 요구하고, 그건 노트 파일을 읽어야 나온다.

**Files:**
- Create: `src/lib/conceptGroups.ts`, `src/lib/conceptGroups.test.ts`
- Create: `src/hooks/useSrsKeysByNode.ts`
- Test: 위 테스트 파일

**Interfaces:**
- Consumes: `tierOf`·`MasteryEvidence` (mastery), `DomainGroup`·`ConceptItem` (radial), `Match` (resumeTypes), `useNotePool` (hooks), `extractQuizItems` (quiz), `listDomains` (domains)
- Produces:
  - `toDomainGroups(matches: Match[], nodes: GraphNode[], ev: MasteryEvidence): DomainGroup[]`
  - `useSrsKeysByNode(nodes: GraphNode[]): { loading: boolean; srsKeysByNode: Map<string, string[]> }`

- [ ] **Step 1: 실패하는 어댑터 테스트 작성**

```ts
// conceptMatch.test.ts 의 node() 헬퍼와 같은 형태. 도메인 두 개를 쓴다.
const node = (
  id: string, label: string, domain: string, level: 0 | 1 | 2 = 1,
): GraphNode => ({
  id, label, domain, level, icon: '', summary: '', keywords: [],
  status: 'todo', position: { x: 0, y: 0 },
})

const nodes: GraphNode[] = [
  node('database', 'Database', 'database', 0),
  node('db-tx', '트랜잭션', 'database'),
  node('db-isolation', '격리수준', 'database'),
  node('system-design', 'System Design', 'system-design', 0),
  node('sd-mq', '메시지 큐', 'system-design'),
]

const m = (nodeId: string, via: MatchVia = 'chip'): Match => ({ nodeId, via, evidence: 'x' })

describe('toDomainGroups', () => {
  const ev: MasteryEvidence = {
    srsKeysByNode: new Map(), srs: {}, quizStats: {},
    domainOfNode: (id) => nodes.find((n) => n.id === id)?.domain ?? '',
  }

  it('groups by node domain and labels the group with the level-0 node', () => {
    const g = toDomainGroups([m('db-tx'), m('sd-mq'), m('db-isolation')], nodes, ev)
    expect(g.map((x) => [x.domain, x.label])).toEqual([
      ['database', 'Database'],
      ['system-design', 'System Design'],
    ])
    expect(g[0].items.map((i) => i.nodeId)).toEqual(['db-tx', 'db-isolation'])
    expect(g[1].items.map((i) => i.nodeId)).toEqual(['sd-mq'])
  })

  it('drops matches whose nodeId is not in the graph', () => {
    // LLM 환각 id는 mergeLlm이 이미 거르지만, 그래프에서 노드가 삭제된 뒤 저장된
    // 오래된 프로젝트도 같은 상태가 된다. 어댑터가 조용히 버려야 지도가 안 깨진다.
    expect(toDomainGroups([m('no-such-node')], nodes, ev)).toEqual([])
  })

  it('never emits a level-0 domain node as a concept item', () => {
    // 도메인 헤더는 개념이 아니다. ring 1에 이미 그려지므로 ring 2에 또 나오면
    // 자기 자신을 가리키는 노드가 생긴다.
    expect(toDomainGroups([m('database')], nodes, ev)).toEqual([])
  })

  it('deduplicates a nodeId that appears twice', () => {
    // 칩과 키워드가 같은 노드를 잡을 수 있다. matchLocal은 노드당 한 번만 emit하지만
    // mergeLlm 이후의 배열은 그 보장을 물려받지 않는다.
    const g = toDomainGroups([m('db-tx', 'chip'), m('db-tx', 'keyword')], nodes, ev)
    expect(g[0].items).toHaveLength(1)
    expect(g[0].items[0].via).toBe('chip')   // 먼저 온 것을 남긴다
  })

  it('assigns the tier from mastery evidence', () => {
    // srs 기록이 전혀 없으면 'unverified' — "구멍"이 아니라 "확인 필요"다.
    expect(toDomainGroups([m('db-tx')], nodes, ev)[0].items[0].tier).toBe('unverified')

    const solid: MasteryEvidence = {
      ...ev,
      srsKeysByNode: new Map([['db-tx', ['k1']]]),
      srs: { k1: { ef: 2.5, interval: 10, reps: 3, lapses: 0, due: '2026-09-01' } },
    }
    expect(toDomainGroups([m('db-tx')], nodes, solid)[0].items[0].tier).toBe('solid')
  })

  it('orders groups deterministically regardless of match order', () => {
    // 지도가 렌더마다 흔들리면 사용자는 자기가 뭘 봤는지 잃는다.
    const a = toDomainGroups([m('sd-mq'), m('db-tx')], nodes, ev)
    const b = toDomainGroups([m('db-tx'), m('sd-mq')], nodes, ev)
    expect(a.map((x) => x.domain)).toEqual(b.map((x) => x.domain))
  })
})
```

`SrsCard` 는 `{ ef, interval, reps, lapses, due }` 다 (`src/lib/srs.ts:5`). `ease` 가 아니라 `ef`.

- [ ] **Step 2: 실패 확인** → FAIL.

- [ ] **Step 3: 어댑터 구현**

```ts
// Match[]는 노드 id의 평평한 목록이고 layoutRadial은 도메인별 묶음을 원한다.
// 이 어댑터가 유일한 변환 지점이다 — 모달이 직접 묶으면 테스트가 렌더에 갇힌다.
export function toDomainGroups(
  matches: Match[], nodes: GraphNode[], ev: MasteryEvidence,
): DomainGroup[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const domainLabel = new Map(
    nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label]),
  )
  const groups = new Map<string, ConceptItem[]>()
  const seen = new Set<string>()

  for (const m of matches) {
    if (seen.has(m.nodeId)) continue
    const node = byId.get(m.nodeId)
    // 그래프에 없는 id, 그리고 도메인 헤더 노드는 개념이 아니다.
    if (!node || node.level === 0) continue
    seen.add(m.nodeId)
    const list = groups.get(node.domain) ?? []
    list.push({ nodeId: node.id, label: node.label, tier: tierOf(node.id, ev), via: m.via })
    groups.set(node.domain, list)
  }

  // 도메인 id 정렬 — 결정적이어야 지도가 렌더마다 흔들리지 않는다.
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, items]) => ({ domain, label: domainLabel.get(domain) ?? domain, items }))
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/conceptGroups.test.ts` → PASS.

- [ ] **Step 5: 증거 수집 훅**

`src/hooks/useSrsKeysByNode.ts`:

```ts
// mastery.tierOf는 노드별 SRS 카드 키를 요구한다. 그 관계는 그래프가 아니라 노트
// 본문에 있다(노트 섹션 → 플래시카드 → srsKey). useNotePool이 이미 그 매핑을
// 만들어 주므로 여기서는 nodeId로 묶기만 한다.
export function useSrsKeysByNode(nodes: GraphNode[]): {
  loading: boolean
  srsKeysByNode: Map<string, string[]>
} {
  const { loading, buildItems } = useNotePool(nodes)
  const srsKeysByNode = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const it of buildItems(extractQuizItems)) {
      if (!it.nodeId || !it.srsKey) continue
      const list = out.get(it.nodeId) ?? []
      list.push(it.srsKey)
      out.set(it.nodeId, list)
    }
    return out
  }, [buildItems])
  return { loading, srsKeysByNode }
}
```

훅 테스트는 만들지 않는다 — `useNotePool` 은 `fetch` 로 노트 파일을 읽고, 그걸 흉내 내는
테스트는 `useNotePool` 을 다시 구현하게 된다. 어댑터(`toDomainGroups`)가 순수하고 테스트가
있으므로, 이 훅에 남는 위험은 "묶기"뿐이다. **이 판단을 보고서에 명시할 것.**

- [ ] **Step 6: 전체 검증 + 커밋**

```bash
git add src/lib/conceptGroups.ts src/lib/conceptGroups.test.ts src/hooks/useSrsKeysByNode.ts
git commit -m "feat(resume): 도메인 그룹 어댑터와 노드별 SRS 키 수집"
```

---

### Task 7: 개념 지도 모달

**Files:**
- Create: `src/components/ConceptMapModal.tsx`, `src/components/ConceptMapModal.css`
- Modify: `src/store/resumeStore.ts` (세션 UI 위치)
- Modify: `src/components/ResumeView.tsx`
- Test: `src/components/ConceptMapModal.test.tsx`

**Interfaces:**
- Consumes: `layoutRadial`·`Placed` (radial), `toDomainGroups`, `useSrsKeysByNode`, `useGraphStore` 의 `openNote`·`activeProjectId`, `useResumeStore.mapOpen`
- Produces: `ConceptMapModal({ project, nodes })`; store에 `mapOpen: boolean`·`setMapOpen`

**직전 세션에서 고친 버그와 같은 부류다:** `openNote(nodeId)` 는 `viewMode` 를 `'list'` 로
바꾼다. `App` 이 뷰를 조건부 렌더하므로 `ResumeView` 전체가 unmount되고, 컴포넌트 로컬
상태로 모달 열림을 들고 있으면 돌아왔을 때 닫혀 있다. 그래서 위치를 store에 둔다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// 매칭 3개(도메인 2개)를 가진 프로젝트. 라벨은 nodes 픽스처의 label과 일치해야 한다.
const project: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: '정산 서비스', period: '', role: '',
  stack: [], lifecycle: [], narrative: '한 일', maskDecisions: [],
  matches: [
    { nodeId: 'db-nosql', via: 'chip', evidence: 'Redis' },
    { nodeId: 'db-tx', via: 'keyword', evidence: '트랜잭션' },
    { nodeId: 'sd-mq', via: 'chip', evidence: 'Kafka' },
  ],
  updatedAt: '2026-08-06T00:00:00.000Z',
}

beforeEach(() => {
  useResumeStore.setState({ status: 'unlocked', projects: [project], mapOpen: true })
  useGraphStore.setState({ viewMode: 'resume', selectedId: null })
})

describe('ConceptMapModal', () => {
  it('renders the project at the center and one button per matched concept', () => {
    render(<ConceptMapModal project={project} nodes={nodes} />)
    expect(screen.getByText('정산 서비스')).toBeTruthy()
    for (const label of ['SQL vs NoSQL / Redis', '트랜잭션', '메시지 큐']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy()
    }
  })

  it('shows a +N badge on a domain whose concepts were capped', () => {
    // PER_DOMAIN_CAP = 6. 같은 도메인에 7개를 주면 도메인 노드에 +1이 붙는다.
    const many: Project = {
      ...project,
      matches: DB_SEVEN.map((id) => ({ nodeId: id, via: 'chip' as const, evidence: 'x' })),
    }
    render(<ConceptMapModal project={many} nodes={nodes} />)
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('opens the note and closes the modal when a concept is clicked', () => {
    render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /트랜잭션/ }))
    expect(useGraphStore.getState().viewMode).toBe('list')
    expect(useGraphStore.getState().selectedId).toBe('db-tx')
    // mapOpen은 false가 아니다 — 돌아왔을 때 다시 열려 있어야 한다(다음 테스트).
  })

  // 이게 이 태스크의 핵심 회귀 테스트다. 노트를 보고 돌아오면 지도가 다시 열려 있어야
  // 한다 — 위치가 컴포넌트 로컬 상태면 이 테스트가 깨진다.
  it('is still open after unmount and remount (going to a note and back)', () => {
    const { unmount } = render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /트랜잭션/ }))
    unmount()
    render(<ConceptMapModal project={project} nodes={nodes} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('closes on Escape and on the close button', () => {
    const { unmount } = render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useResumeStore.getState().mapOpen).toBe(false)
    unmount()

    useResumeStore.setState({ mapOpen: true })
    render(<ConceptMapModal project={project} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(useResumeStore.getState().mapOpen).toBe(false)
  })

  // 지도는 개념 이름만 다룬다. 서술문이 여기 올 이유가 없다.
  it('never renders the narrative', () => {
    const p: Project = { ...project, narrative: '비밀서술문' }
    const { container } = render(<ConceptMapModal project={p} nodes={nodes} />)
    expect(container.textContent).not.toContain('비밀서술문')
  })

  it('explains itself when the project has no matches yet', () => {
    render(<ConceptMapModal project={{ ...project, matches: [] }} nodes={nodes} />)
    expect(screen.getByText(/매칭된 개념이 없습니다/)).toBeTruthy()
    // 빈 원을 그려 놓으면 고장으로 보인다.
    expect(screen.queryByText('정산 서비스')).toBeNull()
  })

  it('renders nothing when mapOpen is false', () => {
    useResumeStore.setState({ mapOpen: false })
    const { container } = render(<ConceptMapModal project={project} nodes={nodes} />)
    expect(container.textContent).toBe('')
  })
})
```

`DB_SEVEN` 은 `nodes` 픽스처에서 `domain: 'database'` 인 개념 노드 7개의 id 배열이다.
픽스처에 7개가 있어야 cap 테스트가 성립한다 — 픽스처를 먼저 그만큼 만들어라.

- [ ] **Step 2: 실패 확인** → FAIL.

- [ ] **Step 3: store 슬라이스 추가**

`src/store/resumeStore.ts` — `error` 옆에 (`activeProjectId` 는 graphStore에 있다. 라우트
상태와 UI 위치는 다른 것이다 — `mapOpen` 은 URL에 실리지 않으므로 여기가 맞다):

```ts
  // 세션 전용 UI 위치. 영속화하지 않는다 — 새로고침하면 금고가 잠기므로 복원할 지도가
  // 없다. store에 두는 이유는 "이 개념 보기"가 viewMode를 바꿔 ResumeView를 unmount
  // 시키기 때문이다(퀴즈 탭에서 같은 이유로 카드 위치를 store로 옮겼다).
  mapOpen: boolean
  setMapOpen: (open: boolean) => void
```

`lock()` 과 `destroyVault()` 에서 `mapOpen: false` 로 초기화한다. `activeProjectId` 는
`graphStore` 에 있으므로 `useGraphStore.getState().setActiveProject(null)` 로 함께 지운다 —
잠긴 뒤 지도가 열려 있으면 안 된다.

- [ ] **Step 4: 구현**

React Flow를 쓰지 않는다. `layoutRadial` 이 절대 좌표를 주므로 **인라인 SVG + 절대배치
버튼**으로 충분하고, 그게 테스트도 쉽다(`@xyflow/react` 는 jsdom에서 크기 측정이 필요해
렌더 테스트가 번거롭다). 기존 그래프 탭과 다른 렌더러라는 점을 파일 상단 주석에 적어라.

```tsx
const { srsKeysByNode, loading } = useSrsKeysByNode(nodes)
const groups = useMemo(() => toDomainGroups(project.matches, nodes, {
  srsKeysByNode, srs, quizStats, domainOfNode: (id) => byId.get(id)?.domain ?? '',
}), [project.matches, nodes, srsKeysByNode, srs, quizStats, byId])
const placed = useMemo(() => layoutRadial(project.name, groups), [project.name, groups])
```

- 컨테이너: `role="dialog"`, `aria-modal="true"`, `aria-label="개념 지도"`.
  Escape 키와 배경 클릭으로 닫는다(`setMapOpen(false)`).
- 링 0/1은 `<div>`, 링 2(개념)는 `<button>` — 클릭 가능한 것은 버튼이어야 키보드로 닿는다.
- 개념 버튼: `data-tier={tier}` `data-via={via}` 를 달고 색은 CSS에서 테마 변수로 준다.
  `title` 에 `via`(칩/키워드/AI) 를 넣어 왜 나왔는지 알 수 있게 한다.
- 연결선은 `<svg>` 한 장에 `<line>` 로 그린다(중심→도메인, 도메인→개념). `pointer-events: none`.
- 개념 클릭 핸들러는 `openNote(nodeId)` **하나만** 부른다. `setMapOpen(false)` 를 함께
  부르면 안 된다 — `openNote` 가 `viewMode` 를 `'list'` 로 바꿔 이 모달이 unmount되고,
  `mapOpen` 이 false면 `내 이력` 으로 돌아왔을 때 지도가 닫혀 있다. 그게 이 태스크가
  막으려는 버그다. 뷰가 바뀌어 안 보이는 것과 사용자가 닫은 것은 다른 사건이다.
  `mapOpen: false` 는 닫기 버튼·Escape·배경 클릭·`lock()` 에서만 일어난다.
- `loading` 이면 등급 대신 `확인 중` 표시. 전부 `unverified` 로 그려 놓으면 "아직 안 읽었다"를
  "다 모른다"로 오독시킨다.
- `groups.length === 0` 이면 지도를 그리지 않고 안내 문구.

좌표 → 화면: `layoutRadial` 은 원점 중심 좌표를 준다. 컨테이너 중앙을 원점으로 삼아
`left: calc(50% + ${x}px)`, `top: calc(50% + ${y}px)`, `transform: translate(-50%, -50%)`.

- [ ] **Step 5: 통과 확인 + 전체 검증 + 커밋**

```bash
git add src/components/ConceptMapModal.tsx src/components/ConceptMapModal.test.tsx \
        src/components/ConceptMapModal.css src/store/resumeStore.ts src/components/ResumeView.tsx
git commit -m "feat(resume): 개념 지도 모달 (방사형 + 노트 이동 + 복귀 위치 유지)"
```

---

### Task 8: AI 추출 버튼 배선

**Files:**
- Modify: `src/components/MaskPanel.tsx` (또는 `ResumeView` — 구현자 판단, 미리보기 옆이 자연스럽다)
- Test: `src/components/MaskPanel.test.tsx` (추가)

**Interfaces:**
- Consumes: `requestExtract(project, nodes)` (extract), `mergeLlm` (conceptMatch), `useResumeStore.upsertProject`

- [ ] **Step 1: 실패하는 테스트 작성**

`requestExtract` 를 `vi.mock('../lib/extract')` 로 스텁한다. 실제 네트워크는 이 태스크
범위가 아니다 — 전송 본문의 안전성은 `extract.wire.test.ts` 가 이미 지킨다.

```tsx
vi.mock('../lib/extract', () => ({ requestExtract: vi.fn(), prepareExtract: vi.fn() }))
import { requestExtract } from '../lib/extract'
const mockExtract = vi.mocked(requestExtract)

// 마스킹이 이미 확정된 프로젝트 — 게이트가 아니라 추출 결과 처리를 보는 테스트들이다.
const decided: Project = {
  id: '7f3c2a91-0000-4000-8000-000000000001', name: 'p', period: '', role: '',
  stack: [], lifecycle: [], narrative: '(주)정산 에서 중복 결제가 있었다',
  maskDecisions: [{ text: '정산', kind: 'company', mask: true }],
  matches: [{ nodeId: 'db-nosql', via: 'chip', evidence: 'Redis' }],
  updatedAt: '2026-08-06T00:00:00.000Z',
}

beforeEach(() => {
  mockExtract.mockReset()
  useResumeStore.setState({ status: 'unlocked', projects: [decided], error: null })
})

describe('AI 개념 추출', () => {
  it('merges returned ids into the project matches as via=llm', async () => {
    mockExtract.mockResolvedValue({
      ok: true, nodeIds: ['db-isolation'],
      reasons: { 'db-isolation': '중복 결제는 격리수준 문제로 이어진다' },
    })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => {
      const m = useResumeStore.getState().projects[0].matches
      expect(m.find((x) => x.nodeId === 'db-isolation')?.via).toBe('llm')
      // 기존 로컬 매칭이 사라지지 않는다.
      expect(m.some((x) => x.nodeId === 'db-nosql')).toBe(true)
    })
  })

  it('reports the rate limit without touching the project', async () => {
    mockExtract.mockResolvedValue({ ok: false, reason: 'rate_limited' })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/한도/)).toBeTruthy())
    expect(useResumeStore.getState().projects[0].matches).toEqual(decided.matches)
  })

  it('reports unauthenticated distinctly from a network failure', async () => {
    mockExtract.mockResolvedValue({ ok: false, reason: 'unauthenticated' })
    const { unmount } = render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/로그인/)).toBeTruthy())
    unmount()

    mockExtract.mockResolvedValue({ ok: false, reason: 'network' })
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/네트워크/)).toBeTruthy())
  })

  // requestExtract는 마스킹 미확정에서 reject한다(Task 2) — Outcome이 아니라 예외다.
  // try/catch를 빼먹으면 unhandled rejection이 되고 화면에는 아무 일도 안 일어난다.
  it('catches the mask-gate rejection and shows its message', async () => {
    mockExtract.mockRejectedValue(new Error('마스킹 여부가 결정되지 않은 후보가 1개 있어 전송을 중단했습니다: 물류'))
    render(<MaskPanel project={decided} nodes={nodes} />)
    fireEvent.click(screen.getByRole('button', { name: /AI 개념 추출/ }))
    await waitFor(() => expect(screen.getByText(/결정되지 않은 후보가 1개/)).toBeTruthy())
  })

  it('disables the button while a request is in flight', async () => {
    let release: (v: { ok: false; reason: 'network' }) => void = () => {}
    mockExtract.mockReturnValue(new Promise((r) => { release = r }))
    render(<MaskPanel project={decided} nodes={nodes} />)
    const btn = screen.getByRole('button', { name: /AI 개념 추출/ })
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    // 두 번 눌려도 요청은 한 번이어야 한다 — 일일 상한을 두 칸 먹는다.
    fireEvent.click(btn)
    expect(mockExtract).toHaveBeenCalledTimes(1)
    release({ ok: false, reason: 'network' })
    await waitFor(() => expect(btn).not.toBeDisabled())
  })
})
```

- [ ] **Step 2: 실패 확인** → FAIL.

- [ ] **Step 3: 구현**

```tsx
const run = async () => {
  setBusy(true); setBanner(null)
  try {
    const out = await requestExtract(project, nodes)
    if (!out.ok) {
      setBanner({
        rate_limited: '오늘 AI 사용 한도를 다 썼습니다. 지도는 로컬 매칭으로 이미 그려져 있습니다.',
        unauthenticated: 'AI 추출은 로그인이 필요합니다.',
        extract_error: 'AI 추출에 실패했습니다.',
        network: '네트워크에 연결할 수 없습니다.',
      }[out.reason])
      return
    }
    const merged = mergeLlm(project.matches, { nodeIds: out.nodeIds, reasons: out.reasons }, nodes)
    if (merged.dropped > 0) {
      setBanner(`AI가 준 개념 ${merged.dropped}개는 그래프에 없어 버렸습니다.`)
    }
    await upsertProject({ ...project, matches: merged.matches, updatedAt: new Date().toISOString() })
  } catch (e) {
    // 마스킹 게이트는 Outcome이 아니라 예외로 온다 — 불변식 위반이라 다른 실패와
    // 같은 모양으로 흘려보내면 안 된다는 설계다(extract.ts 주석 참조).
    setBanner(e instanceof Error ? e.message : String(e))
  } finally {
    setBusy(false)
  }
}
```

`mergeLlm` 의 실제 반환 형태(`{ matches, dropped }`)를 `src/lib/conceptMatch.ts` 에서
확인하고 그것에 맞춰라. 위 코드는 그 형태를 가정한다.

- [ ] **Step 4: 통과 확인 + 전체 검증**

Run: `npx vitest run && npm run build && npm run lint`

- [ ] **Step 5: 최종 수동 확인 (보고서 필수)**

`npm run dev` 후 처음부터 끝까지 한 번 밟고, 각 단계 결과를 보고서에 적는다:

1. `#/resume` → 패스프레이즈 설정 → 금고 생성
2. 프로젝트 등록 (서술문에 `(주)정산` 과 `Redis` 를 넣는다)
3. 마스킹 패널에 `정산` 이 후보로 뜨고 `Redis` 는 **뜨지 않는지** (never-mask)
4. `가리기` 후 미리보기에 `[COMPANY_1]` 이 보이고 원문이 없는지
5. `개념 지도` → `db-nosql` 이 보이는지, 클릭하면 노트로 가는지
6. `내 이력` 탭으로 돌아오면 **지도가 다시 열려 있는지** (Task 7 회귀)
7. 새로고침 → 잠김 화면 → 패스프레이즈로 다시 열리는지
8. 잠긴 상태에서 DOM에 프로젝트 이름이 없는지 (개발자도구 검색)

- [ ] **Step 6: 커밋**

```bash
git add src/components/MaskPanel.tsx src/components/MaskPanel.test.tsx
git commit -m "feat(resume): AI 개념 추출 버튼 배선과 실패 경로 안내"
```

---

## 이 플랜을 끝낸 뒤 남는 것

| 항목 | 이유 |
|---|---|
| `useResumeSync` (클라우드 동기화) | 위 "범위에서 빼는 것" 참조. **사용자의 "어디서든 재개" 요구는 이것 없이 충족되지 않는다.** |
| Task 9 SQL 배포 검증 | `docs/worklog/2026-08-05-resume-concept-map-core.md` 참조. 동기화 플랜의 전제조건이다. |
| 기술스택 칩 자동완성 | 5단계(다듬기) |
| 애니메이션·반응형 | 5단계 |
| spec B (프로젝트 기반 하드 면접) | `graph.json` 에 cloud/IaC/testing/build-tool 노드가 없어 `qa`·`ops` 단계가 면접할 대상이 없다. 콘텐츠 작업 선행. |
| `-하다` 동사형 매칭 | `PARTICLES` 에 없어 `복제했다`·`인증했다`·`롤백했다` 가 미스 |
