# SRS (간격 반복 / Spaced Repetition) — 설계 (Design Spec)

**날짜:** 2026-07-21
**상태:** 승인됨 (구현 계획 대기)

## 목표 (Goal)

플래시카드 Q&A를 **카드 단위 간격 반복(SRS)**으로 스케줄링해, "오늘 복습할 카드"만 due 순서로 보여준다. 아는 카드는 간격이 지수로 늘어 뜸하게, 자주 틀리는 카드는 짧은 간격으로 자주 다시 나오게 한다. 목표는 **학습 시간 최소화 + 약점 집중 반복**이다.

## 배경 / 근거 (Context)

- 현재 `quizStats`는 **도메인 단위**(`{correct, seen}`)로만 집계된다. 카드 하나하나의 숙련도/일정은 없다.
- 플래시카드/드릴다운 모두 **2단계 자기평가(몰랐음/알았음)** → `recordQuizResult(domain, correct)`.
- `useNotePool`이 각 아이템에 위치 기반 `key = path#slug#index`를 부여한다. 이 키는 노트 편집 시 인덱스가 밀려 **SRS 상태 정렬이 깨진다** → SRS는 **질문 텍스트 해시 기반의 안정적 키**가 필요하다.
- 게스트/로그인은 **완전 분리**(no merge). `useCloudSync`가 studiedIds + quizStats의 단일 퍼시스턴스 오케스트레이터. SRS도 여기 편입한다.
- 클라우드 `user_state` 테이블: `user_id`, `studied_ids text[]`, `quiz_stats jsonb`, `updated_at`. SRS는 새 컬럼 필요.

## 확정된 결정 (Decisions)

1. **대상 = 플래시카드만.** 드릴다운은 지금처럼 약점 진단용으로 유지(SRS 미적용).
2. **알고리즘 = 라이트 SM-2.** 카드별 ease factor(ef) + interval 유지, 성공 시 지수 증가.
3. **복습 모드 자기평가 = 3단계(모름 / 애매 / 쉬움).** 기존 플래시카드/드릴다운은 2버튼 유지.
4. **진입 = 퀴즈 탭 3번째 토글 `🔁 복습(N)` + 홈 랜딩 '면접 퀴즈' 카드에 due 배지.**
5. **플래시카드도 SRS를 씨딩한다.** 플래시카드 2버튼(몰랐음=grade 0, 알았음=grade 4)도 카드의 SRS 기록을 생성/갱신 → 어디서 풀든 스케줄이 쌓인다. 복습 모드 3버튼이 ease 튜닝을 정교화한다.
6. **신규 카드 하루 상한 15개**, 약점 도메인 우선. **실패 시 due=내일**(날짜 단위, 당일 재복습 없음 — 무한루프 방지).

## 데이터 모델 (Data Model)

```ts
export interface SrsCard {
  ef: number        // ease factor (기본 2.5, 최소 1.3)
  interval: number  // 다음 복습 간격(일)
  reps: number      // 연속 성공 횟수 (실패 시 0으로 리셋)
  lapses: number    // 잊은(실패) 누적 횟수 — 약점 지표
  due: string       // 'YYYY-MM-DD' — 이 날짜부터 복습 대상
}
export type SrsState = Record<string, SrsCard>   // key = srsKey
```

- **srsKey = `${path}#${slug}#${hashSeed(question)}`** (`hashSeed`는 `lib/quiz.ts`의 기존 FNV-1a). 노트 순서를 바꾸거나 답변을 고쳐도 질문 문구가 같으면 스케줄 유지. 질문 문구를 바꾸면 새 카드로 취급(허용).
- 날짜는 로컬 `'YYYY-MM-DD'` 문자열(기존 `todayStr()` 규칙). ISO 형식이라 문자열 비교(`<=`)로 due 판정 가능.

### 저장 (Persistence)

- 게스트: `localStorage` 키 `im.srs`.
- 로그인: `user_state.srs jsonb` (신규 컬럼).
- 게스트/로그인 완전 분리 — 기존 studiedIds/quizStats와 동일한 오케스트레이션(로그인 시 클라우드로 REPLACE, 로그아웃 시 게스트 스냅샷 복원, 즉시 write-through, user는 ref로 참조해 모드 전환 stale-write 방지).

### Supabase 스키마 변경 (SQL)

```sql
alter table public.user_state
  add column if not exists srs jsonb not null default '{}'::jsonb;
```

RLS 정책은 기존 own-row 정책이 컬럼 무관하게 적용되므로 추가 변경 없음.

## SM-2 엔진 (`src/lib/srs.ts` — 순수 함수)

```ts
export const NEW_CARD_DAILY_CAP = 15
const EF_MIN = 1.3
const EF_START = 2.5

// grade: 0(모름) | 3(애매) | 5(쉬움)  [플래시카드: 0(몰랐음) | 4(알았음)]
export function review(prev: SrsCard | undefined, grade: number, today: string): SrsCard {
  const base: SrsCard = prev ?? { ef: EF_START, interval: 0, reps: 0, lapses: 0, due: today }
  let { ef, interval, reps, lapses } = base

  if (grade < 3) {
    reps = 0
    interval = 1          // 실패 → 내일 다시
    lapses += 1
  } else {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 6
    else interval = Math.round(interval * ef)
  }

  ef = Math.max(EF_MIN, ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))

  return { ef, interval, reps, lapses, due: addDays(today, interval) }
}
```

- `addDays(dateStr, n)`: 로컬 날짜 문자열에 n일을 더해 `'YYYY-MM-DD'` 반환(순수, UTC/타임존 이슈 없게 로컬 컴포넌트로 계산).
- `srsKeyOf(path, slug, question) => string`: `${path}#${slug}#${hashSeed(question)}`.

## 복습 덱 구성 (`src/lib/srs.ts`)

```ts
export interface ReviewCandidate { srsKey: string; domain: string /* + 카드 필드 */ }

export function buildReviewDeck<T extends { srsKey: string; domain: string }>(
  pool: T[],
  srs: SrsState,
  today: string,
  weakDomainsOrder: string[],   // 약점 도메인 우선순위 (앞일수록 약점)
): T[]
```

- **due 카드**: `srs[srsKey]`가 존재하고 `due <= today`. `due` 오름차순(가장 밀린 것 먼저).
- **신규 카드**: `srs[srsKey]`가 없는 카드. 약점 도메인 우선으로 정렬 후 **앞에서 `NEW_CARD_DAILY_CAP`개**만.
- 최종 덱 = `[...due, ...newCapped]`.
- `dueCount(pool, srs, today) => number`: `due 카드 수 + min(신규 카드 수, CAP)` — 토글/홈 배지에 사용.

## UI / 화면 (Layout)

### QuizTab 토글 (3번째 추가)

```
[ 플래시카드 ]  [ 🎤 드릴다운 ]  [ 🔁 복습 (N) ]
```
- N = `dueCount(...)`. 0이면 배지 숨김(또는 "0"), 토글은 항상 표시.

### ReviewView (신규)

```
🔁 오늘의 복습          (남은 N개)
┌──────────────────────────────┐
│  [도메인 칩]                  │
│  Q. 질문 …                     │
│  ── 답 보기 ──                 │
│  A. 답변 (reveal 후)           │
└──────────────────────────────┘
   [ 모름 ]   [ 애매 ]   [ 쉬움 ]   ← reveal 후 노출
```
- reveal 전: 질문 + "답 보기" 버튼만. reveal 후: 답 + 3버튼.
- 버튼 클릭 → `recordReview(srsKey, item, grade)` → 다음 카드. 덱 소진 시 완료 화면.
- 완료/빈 상태: due·신규 0 → "오늘 복습 완료 🎉 다음 복습: `<가장 가까운 due 날짜>`".
- 스타일: 기존 `.quiz`/`.drill`와 동일하게 `flex:1; min-height:0; overflow-y:auto` (QuizTab의 스크롤 자식).

### HomeView 배지

- '면접 퀴즈' 카드 설명 옆/아래에 due>0일 때 `🔁 오늘 N개` 작은 배지.

## 아키텍처 / 파일 구조 (Architecture)

| 파일 | 변경 |
|---|---|
| `src/lib/srs.ts` | **신규** — `SrsCard`/`SrsState`, `review()`, `addDays()`, `srsKeyOf()`, `buildReviewDeck()`, `dueCount()`, `NEW_CARD_DAILY_CAP` (모두 순수 → Vitest) |
| `src/store/graphStore.ts` | `srs: SrsState`; `setSrs()`; `recordReview(srsKey, item, grade)` (srs 갱신 + 기존 `recordQuizResult(domain, grade>=3)`로 도메인 통계도 갱신); `readGuestSrs()` export |
| `src/lib/cloudSync.ts` | `loadSrs(userId)` / `saveSrs(userId, srs)` (컬럼 `srs`), `logError` 동일 패턴 |
| `src/hooks/useCloudSync.ts` | srs를 studiedIds/quizStats와 동일하게 게스트↔클라우드 분리 편입 (`guestSrsRef`, load-on-login REPLACE, logout restore, write-through effect keyed on `srs`) |
| `src/hooks/useNotePool.ts` | 반환 아이템에 `srsKey` 추가(질문 해시 기반). `NoteContext`에 `srsKey: string` 필드 추가 |
| `src/components/QuizView.tsx` | `assess(correct)`에서 `recordReview(card.srsKey, card, correct ? 4 : 0)` 호출(2버튼 씨딩). 기존 도메인 통계는 `recordReview` 내부에서 함께 갱신되므로 중복 호출 제거 |
| `src/components/ReviewView.tsx` + `.css` | **신규** — 3버튼 복습 UI |
| `src/components/QuizTab.tsx` (+ `.css`) | 3번째 토글 `🔁 복습(N)`; `mode: 'flash' | 'drill' | 'review'` |
| `src/components/HomeView.tsx` | '면접 퀴즈' 카드 due 배지 |
| Supabase | `user_state`에 `srs jsonb` 컬럼 추가(위 SQL) |

### 계약 (Interfaces)

- `srsKeyOf(path: string, slug: string, question: string): string`
- `review(prev: SrsCard | undefined, grade: number, today: string): SrsCard`
- `addDays(dateStr: string, n: number): string`
- `buildReviewDeck<T extends {srsKey:string; domain:string}>(pool: T[], srs: SrsState, today: string, weakDomainsOrder: string[]): T[]`
- `dueCount<T extends {srsKey:string; domain:string}>(pool: T[], srs: SrsState, today: string): number`
- store: `recordReview(srsKey: string, item: {domain: string}, grade: number): void`

## 데이터 흐름 (Data Flow)

1. 앱 로드 → `useNotePool`이 노트 fetch → 각 아이템에 `srsKey` 부착.
2. 게스트: store가 `readGuestSrs()`로 초기화. 로그인: `useCloudSync`가 `loadSrs`로 클라우드 srs를 REPLACE.
3. 플래시카드에서 몰랐음/알았음 → `recordReview(srsKey, card, 0|4)` → `review()`로 SrsCard 갱신 + 도메인 통계 갱신 → write-through(게스트 localStorage / 로그인 클라우드).
4. 복습 토글 → `buildReviewDeck(pool, srs, today, weakOrder)` → due+신규 덱. 3버튼 → `recordReview(srsKey, card, 0|3|5)` → 다음 카드.
5. 배지 N = `dueCount(pool, srs, today)` (토글 + 홈).

## 에러 / 엣지 (Edge Cases)

- **노트 편집으로 질문 문구 변경**: 새 srsKey → 새 카드로 시작(과거 스케줄 유실). 의도된 동작(정확성 우선).
- **덱이 비었을 때**: due·신규 모두 0 → 완료 화면 + 다음 due 날짜(없으면 "복습할 카드가 아직 없어요").
- **로그아웃/로그인 전환 중 stale write**: 기존 useCloudSync 패턴대로 user를 ref로 참조, write-through는 데이터(`srs`)에만 의존.
- **클라우드 컬럼 부재/오류**: `logError`로 콘솔 노출, 앱은 게스트 데이터로 계속 동작(크래시 없음).
- **하루에 신규 15개 초과 학습**: 세션을 다시 열면 그날 상한을 다시 채울 수 있음(별도 일일 카운터 없음 — YAGNI). 사용자가 더 하겠다는 명시적 행동이므로 허용.

## 테스트 (Testing)

- **Vitest (순수, `src/lib/srs.test.ts`)**
  - `review()`: 첫 성공(interval 1), 두 번째 성공(interval 6), 세 번째 성공(round(interval×ef)), 실패(reps 0·interval 1·lapses++·due 내일), ef 증감과 최소 1.3 클램프, grade 매핑(0/3/4/5).
  - `addDays()`: 월/연 경계 넘김.
  - `srsKeyOf()`: 같은 질문 → 같은 키, 다른 질문 → 다른 키, 인덱스 변화에 불변.
  - `buildReviewDeck()`: due 필터·오름차순, 신규 상한 15, 약점 우선, due+신규 결합 순서.
  - `dueCount()`: due + min(신규, 15).
- **Playwright (실브라우저)**: 복습 토글 진입 → 답 보기 → 3버튼 평가 → 배지 감소; 리로드 후 스케줄 유지(게스트); 홈 배지 표시; 콘솔 에러 0.

## 범위 밖 (Out of Scope)

- 드릴다운 SRS, 복습 모드 도메인 필터(약점 우선 정렬로 대체), 시간 단위(intraday) 스케줄/당일 재복습, 일일 신규 카운터, 약점 대시보드(추후 별도), 복습 통계 그래프.
