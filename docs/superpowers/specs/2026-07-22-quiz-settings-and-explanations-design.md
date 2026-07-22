# 퀴즈 알고리즘 선택 + 설명 (Quiz Settings & Explanations) — Design

**Date:** 2026-07-22
**App:** `interview-map/`
**Goal:** 퀴즈 탭의 숨은 알고리즘(플래시카드 순서, SRS 스케줄)을 사용자가 **선택·조절**할 수 있게 하고, 각 알고리즘이 무엇인지 앱 안에서 **설명**한다.

---

## 배경 (현재 상태)

퀴즈 탭에는 3개 모드가 있고 각기 다른 알고리즘을 쓴다:

| 모드 | 현재 알고리즘 | 위치 |
|------|--------------|------|
| **플래시카드** | 날짜 시드 Fisher-Yates 셔플 `seededShuffle(scoped, hashSeed("YYYY-MM-DD:scope"))` — 하루 고정 순서 | `QuizView.tsx` `deck` useMemo |
| **드릴다운** | 꼬리질문 체인 `extractDrillChains` | `DrillView.tsx` |
| **복습** | lite SM-2 간격반복. due 지난 카드(밀린 순) → 새 카드(약점 도메인 우선, 하루 `NEW_CARD_DAILY_CAP=15`개) | `srs.ts` `buildReviewDeck` |

추가로 `weakDomains`(정답률<0.8 & seen≥3, 낮은 순)가 플래시카드의 "약점 보강" 칩과 복습 새 카드 순서에 쓰인다.

**핵심 사실:**
- 플래시카드의 "알았음/몰랐음"(O/X) 버튼도 SRS에 기록됨 (`recordReview(card.srsKey, card, correct ? 4 : 0, today)`). 즉 플래시카드와 복습은 **같은 SRS 스케줄을 공유**.
- 영속화: `studiedIds`·`quizStats`·`srs` 3개가 게스트(localStorage)↔클라우드(`useCloudSync`)로 동기화. 각각 `PROGRESS_KEY`/`QUIZSTATS_KEY`/`SRS_KEY`, store 생성 시 동기 하이드레이션.

---

## 결정된 범위

- 플래시카드 **순서 4종** 선택: 날짜 셔플(기본)·완전 랜덤·순차·약점/오답 우선
- **3개 모드 + SRS** 알고리즘 설명 (ℹ️ 팝오버)
- **SRS 파라미터**: 하루 새 카드 상한, 난이도 버튼 개수, 데이터 초기화. (ease factor 등 내부값은 노출하지 않음 — 설명만)
- 설정 진입: QuizTab 헤더의 ⚙️ 기어 → 팝오버. 순서 선택은 플래시카드 국소이므로 해당 화면에.

접근법 A 채택(통합 기어 + 인라인 순서 선택 + ℹ️ 팝오버). 이유: 국소 설정(순서=플래시카드, 상한/버튼=복습)은 맥락 화면 옆에, 파괴적/드문 설정(초기화·상한)만 기어에 모아 헤더를 깔끔하게.

---

## 컴포넌트 설계

### 1. 설정 데이터 모델 (`lib/quizSettings.ts`, 신규)

```ts
export interface QuizSettings {
  order: 'daily' | 'random' | 'sequential' | 'weak'  // 플래시카드 순서
  newCardCap: number   // 10 | 15 | 20 | 30 | 0(무제한)
  gradeButtons: 2 | 3 | 5
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  order: 'daily', newCardCap: 15, gradeButtons: 3,
}

export const QUIZSETTINGS_KEY = 'interview-map.quizsettings.v1'

export function readQuizSettings(): QuizSettings // localStorage 병합(기본값 위에 얹기), 파싱 실패 시 기본값
```

- graphStore에 `quizSettings: QuizSettings` + `setQuizSettings(patch: Partial<QuizSettings>)` 추가.
- 다른 상태처럼 store 생성 시 `readQuizSettings()`로 동기 하이드레이션.
- `setQuizSettings`는 부분 병합 후 localStorage에 즉시 저장(effect 불필요 — 취향값이라 useCloudSync에 편입하지 않음). **클라우드 동기화 대상 아님.**

### 2. 플래시카드 순서 (`lib/quiz.ts`에 순수함수 추가)

```ts
export interface OrderCtx {
  seed: number                              // random/daily용 시드
  srsLapses: (srsKey: string) => number     // 카드별 lapses (weak용)
  weakRank: (domain: string) => number      // 약점 도메인 순위 (낮을수록 약함)
}

export function orderDeck<T extends { srsKey: string; domain: string }>(
  scoped: T[], order: QuizSettings['order'], ctx: OrderCtx,
): T[]
```

- `daily` / `random`: `seededShuffle(scoped, ctx.seed)` (호출부가 시드를 다르게 만든다).
- `sequential`: `scoped.slice()` (입력 순서 = 노트 순서, 불변).
- `weak`: `scoped`를 안정 정렬 — 1차 키 `srsLapses>0`(오답) 먼저, 2차 키 `weakRank(domain)` 오름차순.

호출부(`QuizView`):
- `daily` → `seed = hashSeed("YYYY-MM-DD:scope")`
- `random` → `seed = hashSeed("${nonce}:scope")`, `nonce`는 컴포넌트 state; 범위 변경/“다시 섞기” 클릭 시 갱신. (매 카드 넘김마다 재셔플 X — 카운터 왜곡 방지)
- `sequential`/`weak` → seed 무관.
- `weakRank`는 `weakDomains(quizStats, { limit: 99 })`의 인덱스, `srsLapses`는 store의 `srs`.

### 3. SRS 설정

**(a) 하루 새 카드 상한** — `srs.ts` 시그니처 확장(기본값 유지 → 기존 호출 무영향):
```ts
export function buildReviewDeck<T ...>(pool, srs, today, weakDomainsOrder, cap = NEW_CARD_DAILY_CAP): T[]
export function dueCount<T ...>(pool, srs, today, cap = NEW_CARD_DAILY_CAP): number
```
- 호출부는 `const cap = quizSettings.newCardCap === 0 ? Infinity : quizSettings.newCardCap` 전달.
- `.slice(0, cap)` / `Math.min(fresh, cap)`는 `Infinity`에서 자연 동작(전체 반환).
- QuizTab의 복습 배지·ReviewView의 덱 둘 다 cap 반영.

**(b) 난이도 버튼 개수** — `srs.ts`(또는 별도 상수)에 세트 정의:
```ts
export const GRADE_SETS: Record<2|3|5, { grade: number; label: string; cls: string }[]> = {
  2: [ {0,'모름','review-g0'}, {5,'알았음','review-g5'} ],
  3: [ {0,'모름','review-g0'}, {3,'애매','review-g3'}, {5,'쉬움','review-g5'} ],   // 현재
  5: [ {0,'전혀','review-g0'}, {2,'어렴풋','review-g2'}, {3,'애매','review-g3'}, {4,'대략','review-g4'}, {5,'완벽','review-g5'} ],
}
```
- ReviewView가 `GRADE_SETS[quizSettings.gradeButtons]`로 버튼 렌더. `review-g2`/`review-g4` CSS 색상 추가.
- 플래시카드(QuizView)의 O/X 2버튼은 그대로 유지(변경 없음).

**(c) 데이터 초기화** — 설정 팝오버 내 버튼:
- 클릭 → `window.confirm`("퀴즈/복습 기록(정답률·복습 일정)을 모두 초기화할까요? 학습 경로 진도는 유지됩니다.")
- 확인 시 `setSrs({})` + `setQuizStats({})`. `studiedIds`는 유지.
- 로그인 상태면 useCloudSync가 빈 상태를 클라우드에 저장(기존 effect가 srs/quizStats 변경 감지).

### 4. 설명 UI

**`components/InfoPopover.tsx` (신규)** — 재사용 팝오버:
- props: `{ title: string; body: ReactNode; align?: 'left'|'right' }`
- ℹ️ 아이콘 버튼(`LuInfo`), 클릭 토글. 바깥 클릭·Esc 닫힘(문서 리스너, 열렸을 때만).
- 절대 위치 카드, 기존 팝오버 톤(`--bg-elev`, `--border`)과 일치. `InfoPopover.css`.

**`lib/quizHelp.ts` (신규)** — 한국어 도움말 상수:
- `MODE_HELP`: 플래시카드/드릴다운/복습 각 2~4문장.
- `ORDER_HELP`: 날짜 셔플/완전 랜덤/순차/약점·오답 우선 각 1~2문장.
- `SRS_HELP`: 상한·난이도 버튼의 짧은 힌트.

**배치:**
- 모드 탭 줄 옆 ℹ️ → `MODE_HELP` 3종 요약.
- 순서 선택 옆 ℹ️ → `ORDER_HELP` 4종.
- 설정 팝오버 안 각 항목에 `SRS_HELP` 인라인 힌트.

### 5. 설정 진입 (⚙️)

- `QuizTab.tsx` 헤더(모드 탭 줄)에 ⚙️ 버튼 추가 → 설정 팝오버(InfoPopover 재사용 또는 전용 패널) 토글.
- 팝오버 내용: 하루 새 카드 상한(세그먼트 10/15/20/30/무제한) · 난이도 버튼 수(2/3/5) · 데이터 초기화 버튼.

---

## 데이터 흐름

```
graphStore.quizSettings ──┬─> QuizView   : order → orderDeck(scoped, order, ctx) → deck
                          ├─> QuizTab    : newCardCap → dueCount(pool, srs, today, cap) → 배지
                          └─> ReviewView : newCardCap → buildReviewDeck(...cap) → deck
                                           gradeButtons → GRADE_SETS[n] → 버튼

setQuizSettings(patch) → merge → localStorage(QUIZSETTINGS_KEY)   [클라우드 동기화 없음]
데이터 초기화 → setSrs({}) + setQuizStats({}) → (로그인 시) useCloudSync가 클라우드 반영
```

---

## 에러/엣지 케이스

- `readQuizSettings` 파싱 실패/부분 필드 누락 → 기본값 병합으로 방어.
- `newCardCap === 0` → `Infinity`로 변환해 상한 해제.
- `weak` 순서에서 `srs`/`quizStats`가 비어있으면(신규 사용자) 전부 lapses=0·weakRank 동일 → 안정 정렬로 입력 순서(=순차) 유지. 자연스러운 폴백.
- `gradeButtons`가 예상 밖 값 → `GRADE_SETS[n] ?? GRADE_SETS[3]`.
- InfoPopover 여러 개가 동시에 열려도 무방(각자 상태). 바깥 클릭 리스너는 열렸을 때만 등록.

---

## 테스트

- `quiz.test.ts`: `orderDeck` 4종 — sequential은 순서 불변, daily/random은 같은 시드→같은 순서·다른 시드→다른 순서, weak는 lapses>0 우선 + weakRank 순.
- `srs.test.ts`: `buildReviewDeck` cap 파라미터(cap보다 많은 fresh를 잘라냄, Infinity는 전부), `dueCount` cap 반영, `GRADE_SETS`에 2/3/5 키 존재 & grade 오름차순.
- `graphStore.test.ts`: `setQuizSettings` 부분 병합 + localStorage 저장, 하이드레이션.
- 회귀: 전체 `vitest run` 통과 유지, `npm run build` 성공, Playwright로 퀴즈 탭 렌더 + 각 설정 상호작용 + 콘솔 0.

---

## 비목표 (YAGNI)

- SRS 내부값(ease factor, interval 스텝) 노출 — 설명만.
- 설정의 클라우드 동기화 — 기기 취향값이라 로컬 전용.
- 플래시카드 O/X 버튼 개수 변경 — 난이도 버튼 설정은 복습 모드에만 적용.
- 드릴다운 순서 옵션 — 체인 구조상 순서 선택 무의미.
