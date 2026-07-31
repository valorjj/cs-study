# URL 라우팅 / 뒤로가기 내비게이션 설계

- 날짜: 2026-07-31
- 대상: `interview-map/`
- 상태: 승인됨 (구현 대기)

## 문제

앱의 모든 화면 전환이 zustand 상태(`viewMode`, `selectedId`)로만 이루어진다. 라우터가 없고 URL은 항상 `#`에 머물러 있어서 브라우저 히스토리 엔트리가 하나도 쌓이지 않는다. 결과:

- `코스` 탭에서 개념(예: Big-O)을 열고 뒤로가기를 누르면 아무 일도 일어나지 않는다 (앱 밖으로 나가거나 무반응).
- 새로고침하면 항상 `홈`으로 돌아간다.
- 특정 개념 페이지를 북마크하거나 공유할 수 없다.

추가 맥락: `코스` → 개념 클릭은 단순한 선택 변경이 아니라 `select(id)` + `setViewMode('list')` 이다. 즉 "코스로 돌아가기"는 `selectedId`와 `viewMode` 두 필드를 함께 복원해야 한다.

## 목표

1. 브라우저 뒤로/앞으로 버튼이 앱 내비게이션과 일치하게 동작한다.
2. URL이 현재 위치를 표현한다 — 새로고침해도 자리를 유지하고, 링크를 공유할 수 있다.
3. 새 의존성 없이 (`location.hash` + History API) 구현한다.

## 비목표 (Out of scope)

- react-router 도입
- 노트 내부 섹션 앵커 / 스크롤 위치 복원
- 그래프 카메라 위치(줌·팬)의 URL 반영
- 퀴즈 설정(정렬 순서, SRS 취향값) 등 취향 상태의 URL 반영 — 이들은 localStorage 소관

## URL 문법

```
#/home
#/graph              #/graph/<nodeId>
#/list               #/list/<nodeId>
#/path/<trackId>     예: #/path/curated:foundations, #/path/domain:network
#/quiz/<mode>        mode ∈ flash | drill | review | graph
#/guide
```

세그먼트는 인코딩하지 않는다. 노드 id는 `[a-z0-9-]` 슬러그이고 트랙 id는 `<종류>:<슬러그>` 형태인데, `:` 는 URL fragment에서 합법이라 그대로 두는 편이 읽기 좋다.

파싱은 **전역 함수(total function)** 다. 어떤 입력이 와도 유효한 `Route`를 돌려준다:

| 입력 | 결과 |
|------|------|
| `""`, `"#"`, `"#/"` | `{ view: 'home' }` |
| 알 수 없는 view 세그먼트 | `{ view: 'home' }` |
| `#/list/<존재하지 않는 id>` | `{ view: 'list', nodeId: null }` |
| `#/path/<존재하지 않는 트랙>` | `{ view: 'path', trackId: null }` (PathView가 첫 트랙으로 폴백) |
| `#/quiz` (모드 없음) | `{ view: 'quiz', quizMode: 'flash' }` |
| `#/quiz/<알 수 없는 모드>` | `{ view: 'quiz', quizMode: 'flash' }` |
| 뒤에 붙은 슬래시 / 빈 세그먼트 | 무시 |

노드 검증은 `graph.json` 기준이며 이 데이터는 정적으로 번들에 포함되므로, 첫 페인트 전에 기다려야 하는 비동기 게이트가 없다. 트랙 검증은 `CURATED_TRACKS` + `buildDomainTracks()` 결과를 쓰는데 이는 `nodes`/`edges`에서 파생되므로 역시 동기적이다.

## 구성 요소

### `src/lib/route.ts` (신규, 순수)

```ts
export interface Route {
  view: ViewMode
  nodeId?: string | null
  trackId?: string | null
  quizMode?: QuizMode
}

export function parseHash(hash: string, valid: { nodeIds: Set<string>; trackIds: Set<string> }): Route
export function formatHash(route: Route): string   // 항상 '#/...' 로 시작
```

React도 store도 참조하지 않는다. 정규형(canonical form) 규약: `formatHash(parseHash(h)) === formatHash(parseHash(formatHash(parseHash(h))))` — 즉 한 번 정규화하면 고정점이다.

`QuizMode` 타입은 현재 `QuizTab.tsx`에 있는데, store와 `route.ts`가 모두 참조해야 하므로 `graphStore.ts`로 옮기고 `QuizTab`은 import해 쓴다 (`ViewMode`가 이미 store에 있는 것과 같은 방식).

### `src/hooks/useUrlSync.ts` (신규)

`history`를 만지는 **유일한** 지점. `App`에서 다른 훅들과 나란히 한 번 호출한다.

검증용 id 집합은 훅이 직접 만든다: 노드 id는 `graph.json`에서, 트랙 id는 `src/graph/tracks.ts`의 `CURATED_TRACKS` + `buildDomainTracks(nodes, edges)`에서 (PathView가 쓰는 것과 같은 소스). 모듈 스코프 상수 하나로 뽑아 두 곳이 공유한다.

store 상태에서 `Route`를 뽑는 변환은 훅 안의 작은 헬퍼 `routeFromState(state)`가 담당한다 — view별로 어떤 필드가 URL에 실리는지 결정하는 자리다 (`graph`/`list`는 `nodeId`, `path`는 `trackId`, `quiz`는 `quizMode`, `home`/`guide`는 없음).

1. **마운트 시**: `location.hash`를 파싱해 store에 반영하고, 정규형 해시로 `replaceState`. 멱등이므로 StrictMode의 이중 마운트에도 엔트리가 중복되지 않는다.
2. **store → URL**: 라우트 관련 네 필드를 selector로 구독. `formatHash(state) !== location.hash` 일 때만 `pushState`.
3. **URL → store**: `popstate` 리스너가 파싱 후 store에 반영.

**루프 방지**: 위 (2)의 문자열 비교가 가드 전체다. `popstate`가 발생한 시점에 `location.hash`는 *이미* 새 값이므로, store에 반영하면 `formatHash(state)`가 `location.hash`와 같아져 push가 일어나지 않는다. 별도의 플래그나 ref가 필요 없다.

### `src/store/graphStore.ts` (수정)

세 가지 변경:

1. **`pathTrackId` → 실제 상태로 승격.** 현재는 퀴즈 약점 칩이 쏘는 일회성 *요청*(`requestTrack` → PathView의 effect가 소비 → `clearPathTrack`)이고, 진짜 선택 상태는 PathView의 local `useState`에 있다. 이를 `trackId: string | null` + `setTrackId(id)`로 바꾸고 PathView가 이 값을 읽게 한다. `requestTrack`/`clearPathTrack`/`pathTrackId`와 PathView의 소비 effect는 제거한다. 호출부(퀴즈 약점 칩)는 `setTrackId(id); setViewMode('path')`로 바뀐다.
2. **`quizMode: QuizMode` + `setQuizMode` 추가.** `QuizTab`의 local `useState<QuizMode>('flash')`를 대체한다.
3. **`openNote(id)` 추가** — `set({ selectedId: id, viewMode: 'list', focusRequestId: null })` 단일 액션.

`openNote`가 필요한 이유: 지금 네 곳(`PathView.tsx:66`, `QuizView.tsx:137`, `ReviewView.tsx:95`, `DrillView.tsx:180`)이 `select(id)` 와 `setViewMode('list')` 를 연달아 호출한다. `set`이 두 번이면 구독자도 두 번 깨어나 중간 상태가 새어나간다. 한 액션으로 묶으면 히스토리 엔트리도 정확히 하나다. (`useUrlSync`의 해시 문자열 비교가 중복 push를 막아주긴 하지만, 원자적 액션이 의도를 더 정확히 표현한다.)

### `src/components/PathView.tsx` (수정)

`selectedId` local state를 store의 `trackId`로 교체. `mobileDetail`은 계속 local이되 초기값을 `trackId != null`로 잡고, `trackId`가 바뀌면 `true`로 올린다. 이렇게 하면 코스 딥링크로 들어온 모바일 사용자에게 상세 패널이 바로 열리며, 이는 오늘 `requestTrack`이 하던 동작과 같다.

### `src/components/QuizTab.tsx` (수정)

local `mode` state를 store의 `quizMode`/`setQuizMode`로 교체. 그 외 UI 변경 없음.

## 히스토리 깊이

**모든 전환이 push한다** — 탭 전환, 개념 선택, 트랙 선택, 퀴즈 모드 전환. 뒤로가기 한 번이 정확히 동작 하나를 되돌린다.

따라서 `코스` → Big-O → 뒤로가기는 `#/path/<작업 중이던 트랙>` 으로 돌아간다. 첫 번째 트랙이 아니라 실제로 보고 있던 트랙이다.

DocsView의 `목록` 버튼은 지금처럼 `select(null)` (즉 `#/list`로 push)을 유지하고 `history.back()`으로 바꾸지 않는다. 딥링크로 들어와 이전 엔트리가 없는 사용자에게 `back()`은 앱 밖으로 나가버리는 잘못된 동작이 되기 때문이다.

## 테스트 (TDD)

기존 vitest + testing-library 세팅을 그대로 쓴다.

**`src/lib/route.test.ts`**
- 6개 view 각각의 parse/format 왕복
- `#/list/<id>`, `#/graph/<id>` 노드 id 왕복
- `:` 가 포함된 트랙 id 왕복
- 위 "파싱은 전역 함수" 표의 모든 폴백 케이스
- 정규형 고정점 규약

**`src/hooks/useUrlSync.test.ts`**
- 마운트가 해시를 store에 반영한다
- 마운트가 비정규 해시를 `replaceState`로 정규화하며, 엔트리를 늘리지 않는다
- store 변경이 `pushState`를 부른다
- `popstate`가 store에 반영된다
- 해시가 이미 일치하면 push하지 않는다 (루프 방지)
- 이중 마운트(StrictMode)가 엔트리를 중복시키지 않는다

**`src/store/graphStore.test.ts`** (기존 파일에 추가)
- `openNote(id)`가 `selectedId`/`viewMode`/`focusRequestId`를 한 번의 알림으로 설정한다
- `setTrackId`가 `trackId`를 설정한다

## 검증

`npm test`, `npm run lint`, `npm run build` 통과. 그리고 실제 앱에서: 코스 → 개념 → 뒤로가기 → 같은 트랙의 코스 화면, 그리고 `#/list/cache-locality` 직접 입력 시 해당 노트가 열리는 것을 확인한다.
