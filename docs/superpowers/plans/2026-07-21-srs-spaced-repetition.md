# SRS (간격 반복) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플래시카드 Q&A를 카드 단위 라이트 SM-2 간격 반복으로 스케줄링하고, "오늘 복습" 덱·복습 모드·배지를 추가한다.

**Architecture:** 순수 SM-2 엔진(`lib/srs.ts`) + zustand 스토어 상태(`srs`) + 게스트/클라우드 분리 퍼시스턴스(`useCloudSync`) + 복습 UI(`ReviewView`, `QuizTab` 3번째 토글, 홈 배지). 카드 키는 질문 텍스트 해시로 안정화한다.

**Tech Stack:** React 18 + TypeScript + Vite + zustand + Supabase(@supabase/supabase-js) + Vitest + Playwright.

## Global Constraints

- **작업 디렉토리:** 모든 npm/vitest 명령은 `interview-map/`에서 실행 (`cd interview-map`; 저장소 루트엔 package.json 없음).
- **한국어 설명 + 영어 코드.** 주석/카피는 기존 톤 유지.
- **게스트/로그인 완전 분리** (no merge). 기존 `useCloudSync` 패턴 준수.
- **공개 repo — 비밀·개인정보 커밋 금지.** 커밋 이메일 `30681841+valorjj@users.noreply.github.com`.
- **커밋 트레일러:** 각 커밋 메시지 끝에
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh`
- **브랜치:** `feat/srs-spaced-repetition` (이미 존재, 스펙 커밋 있음). 완료 후 main에 `--ff-only` 병합.
- **날짜 형식:** 로컬 `'YYYY-MM-DD'` 문자열. `new Date()` 기반 today는 UI/스토어에서 주입, 순수 함수는 today를 인자로 받는다.
- **SRS 대상은 플래시카드만.** 드릴다운은 미변경.
- **평가 등급 매핑:** 복습 3버튼 → 모름=0 / 애매=3 / 쉬움=5. 플래시카드 2버튼 → 몰랐음=0 / 알았음=4. 성공 기준 grade ≥ 3.
- **신규 카드 하루 상한 = 15 (`NEW_CARD_DAILY_CAP`).** 실패 시 due=내일(interval 1).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/srs.ts` (신규) | SM-2 순수 엔진: 타입, `srsKeyOf`, `addDays`, `review`, `buildReviewDeck`, `dueCount`, `NEW_CARD_DAILY_CAP` |
| `src/lib/srs.test.ts` (신규) | 위 순수 함수 Vitest |
| `src/store/graphStore.ts` (수정) | `srs` 상태, `SRS_KEY`, `readGuestSrs`, `setSrs`, `recordReview` |
| `src/store/graphStore.test.ts` (신규) | `recordReview` 리듀서 Vitest |
| `src/lib/cloudSync.ts` (수정) | `loadSrs` / `saveSrs` (`srs` 컬럼) |
| `src/hooks/useCloudSync.ts` (수정) | srs를 게스트↔클라우드 분리 오케스트레이션에 편입 |
| `src/hooks/useNotePool.ts` (수정) | 아이템에 `srsKey` 부착, `NoteContext.srsKey` |
| `src/components/QuizView.tsx` (수정) | 2버튼 평가로 SRS 씨딩 (`recordReview`) |
| `src/components/ReviewView.tsx` + `.css` (신규) | 3버튼 복습 UI |
| `src/components/QuizTab.tsx` (수정) + `.css` | 3번째 토글 `🔁 복습(N)` |
| `src/components/HomeView.tsx` (수정) | '면접 퀴즈' 카드 due 배지 |
| `docs/SUPABASE_SETUP.md` (수정) | `srs jsonb` 컬럼 추가 SQL 문서화 |

---

## Task 1: SM-2 core — types, `srsKeyOf`, `addDays`, `review`

**Files:**
- Create: `interview-map/src/lib/srs.ts`
- Test: `interview-map/src/lib/srs.test.ts`

**Interfaces:**
- Consumes: `hashSeed` from `interview-map/src/lib/quiz.ts` — `hashSeed(s: string): number`.
- Produces:
  - `interface SrsCard { ef: number; interval: number; reps: number; lapses: number; due: string }`
  - `type SrsState = Record<string, SrsCard>`
  - `srsKeyOf(path: string, slug: string, question: string): string`
  - `addDays(dateStr: string, n: number): string`
  - `review(prev: SrsCard | undefined, grade: number, today: string): SrsCard`

- [ ] **Step 1: Write the failing tests**

Create `interview-map/src/lib/srs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { srsKeyOf, addDays, review, type SrsCard } from './srs'

describe('srsKeyOf', () => {
  it('is stable for the same question regardless of index/order', () => {
    const a = srsKeyOf('notes/03-network/network-core.md', 'osi-model', 'TCP와 UDP 차이는?')
    const b = srsKeyOf('notes/03-network/network-core.md', 'osi-model', 'TCP와 UDP 차이는?')
    expect(a).toBe(b)
  })
  it('differs when the question text differs', () => {
    const a = srsKeyOf('f.md', 's', 'Q one')
    const b = srsKeyOf('f.md', 's', 'Q two')
    expect(a).not.toBe(b)
  })
  it('differs when the file or slug differs', () => {
    expect(srsKeyOf('f1.md', 's', 'Q')).not.toBe(srsKeyOf('f2.md', 's', 'Q'))
    expect(srsKeyOf('f.md', 's1', 'Q')).not.toBe(srsKeyOf('f.md', 's2', 'Q'))
  })
})

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-07-21', 6)).toBe('2026-07-27')
  })
  it('crosses a month boundary', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
  })
  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('adds zero days', () => {
    expect(addDays('2026-07-21', 0)).toBe('2026-07-21')
  })
})

describe('review', () => {
  const today = '2026-07-21'

  it('first success: interval 1, reps 1, due tomorrow', () => {
    const c = review(undefined, 5, today)
    expect(c.reps).toBe(1)
    expect(c.interval).toBe(1)
    expect(c.due).toBe('2026-07-22')
    expect(c.lapses).toBe(0)
  })

  it('second success: interval 6', () => {
    const first = review(undefined, 4, today)
    const second = review(first, 4, first.due)
    expect(second.reps).toBe(2)
    expect(second.interval).toBe(6)
    expect(second.due).toBe(addDays(first.due, 6))
  })

  it('third success: interval = round(prevInterval * ef)', () => {
    const c1 = review(undefined, 4, today)
    const c2 = review(c1, 4, c1.due)
    const c3 = review(c2, 4, c2.due)
    expect(c3.reps).toBe(3)
    expect(c3.interval).toBe(Math.round(c2.interval * c2.ef))
    expect(c3.interval).toBeGreaterThan(6)
  })

  it('failure resets reps/interval, bumps lapses, due tomorrow', () => {
    const c1 = review(undefined, 5, today)
    const c2 = review(c1, 5, c1.due)
    const fail = review(c2, 0, c2.due)
    expect(fail.reps).toBe(0)
    expect(fail.interval).toBe(1)
    expect(fail.lapses).toBe(1)
    expect(fail.due).toBe(addDays(c2.due, 1))
  })

  it('ease factor rises on grade 5 and never drops below 1.3', () => {
    const easy = review(undefined, 5, today)
    expect(easy.ef).toBeGreaterThan(2.5)
    // repeated failures clamp ef at 1.3
    let c: SrsCard | undefined
    for (let i = 0; i < 20; i++) c = review(c, 0, today)
    expect(c!.ef).toBe(1.3)
  })

  it('grade 3 (애매) counts as a success and keeps ef roughly flat', () => {
    const c = review(undefined, 3, today)
    expect(c.reps).toBe(1)
    expect(c.interval).toBe(1)
    expect(c.ef).toBeCloseTo(2.36, 2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd interview-map && npx vitest run src/lib/srs.test.ts`
Expected: FAIL — `Failed to resolve import "./srs"` / functions not defined.

- [ ] **Step 3: Implement `src/lib/srs.ts` (core only)**

Create `interview-map/src/lib/srs.ts`:

```ts
import { hashSeed } from './quiz'

// Per-card spaced-repetition state (lite SM-2). `due` is a local 'YYYY-MM-DD'
// string so scheduling compares with plain string <=.
export interface SrsCard {
  ef: number        // ease factor (start 2.5, floor 1.3)
  interval: number  // days until next review
  reps: number      // consecutive successes (reset to 0 on a lapse)
  lapses: number    // times forgotten — a weakness signal
  due: string       // 'YYYY-MM-DD' — reviewable on/after this date
}

export type SrsState = Record<string, SrsCard>

const EF_START = 2.5
const EF_MIN = 1.3

// Stable card identity: file + section slug + a hash of the QUESTION text. The
// positional key (path#slug#index) shifts when a note is edited, which would
// misalign SRS state; hashing the question keeps a card's schedule across edits.
export function srsKeyOf(path: string, slug: string, question: string): string {
  return `${path}#${slug}#${hashSeed(question)}`
}

// Add n days to a local 'YYYY-MM-DD' string, returning the same format. Built
// from local date components so there is no timezone/UTC drift.
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

// Lite SM-2. grade: 0..5. Success is grade >= 3.
//   fail  → reps 0, interval 1 (tomorrow), lapses++
//   pass  → reps++, interval 1 → 6 → round(interval*ef)
//   ef    += 0.1 - (5-grade)*(0.08 + (5-grade)*0.02), floored at 1.3
export function review(prev: SrsCard | undefined, grade: number, today: string): SrsCard {
  const base: SrsCard = prev ?? { ef: EF_START, interval: 0, reps: 0, lapses: 0, due: today }
  let { ef, interval, reps, lapses } = base

  if (grade < 3) {
    reps = 0
    interval = 1
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd interview-map && npx vitest run src/lib/srs.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/lib/srs.ts interview-map/src/lib/srs.test.ts
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): SM-2 core — srsKeyOf, addDays, review

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 2: Review deck — `buildReviewDeck`, `dueCount`, `NEW_CARD_DAILY_CAP`

**Files:**
- Modify: `interview-map/src/lib/srs.ts`
- Test: `interview-map/src/lib/srs.test.ts`

**Interfaces:**
- Consumes: `SrsState` (Task 1).
- Produces:
  - `NEW_CARD_DAILY_CAP: number` (= 15)
  - `buildReviewDeck<T extends { srsKey: string; domain: string }>(pool: T[], srs: SrsState, today: string, weakDomainsOrder: string[]): T[]`
  - `dueCount<T extends { srsKey: string; domain: string }>(pool: T[], srs: SrsState, today: string): number`

Deck rule: due cards (srs record exists AND `due <= today`, most-overdue first by `due` ascending) followed by new cards (no srs record), new cards ordered weak-domain-first then capped at `NEW_CARD_DAILY_CAP`. `dueCount` = dueCards + min(newCards, cap).

- [ ] **Step 1: Write the failing tests**

Append to `interview-map/src/lib/srs.test.ts`:

```ts
import { buildReviewDeck, dueCount, NEW_CARD_DAILY_CAP } from './srs'

type Card = { srsKey: string; domain: string }
const mk = (n: number, domain = 'net'): Card => ({ srsKey: `k${n}`, domain })

describe('buildReviewDeck', () => {
  const today = '2026-07-21'

  it('includes only cards due on/before today, most-overdue first', () => {
    const pool = [mk(1), mk(2), mk(3)]
    const srs = {
      k1: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-21' },
      k2: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-19' }, // most overdue
      k3: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-25' }, // future
    }
    const deck = buildReviewDeck(pool, srs, today, [])
    expect(deck.map((c) => c.srsKey)).toEqual(['k2', 'k1'])
  })

  it('appends new (unseen) cards after due cards, capped at NEW_CARD_DAILY_CAP', () => {
    const pool = Array.from({ length: NEW_CARD_DAILY_CAP + 5 }, (_, i) => mk(i))
    const deck = buildReviewDeck(pool, {}, today, [])
    expect(deck.length).toBe(NEW_CARD_DAILY_CAP)
  })

  it('orders new cards weak-domain-first', () => {
    const pool = [mk(1, 'strong'), mk(2, 'weak'), mk(3, 'strong')]
    const deck = buildReviewDeck(pool, {}, today, ['weak'])
    expect(deck[0].domain).toBe('weak')
  })

  it('places due cards before new cards', () => {
    const pool = [mk(1), mk(2)]
    const srs = { k2: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-20' } }
    const deck = buildReviewDeck(pool, srs, today, [])
    expect(deck.map((c) => c.srsKey)).toEqual(['k2', 'k1'])
  })
})

describe('dueCount', () => {
  const today = '2026-07-21'
  it('counts due cards plus capped new cards', () => {
    const pool = Array.from({ length: NEW_CARD_DAILY_CAP + 2 }, (_, i) => mk(i + 10))
    const srs = { k10: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-20' } }
    // 1 due (k10) + min(rest new, cap). rest new = pool minus k10 = cap+1 → capped to cap.
    expect(dueCount(pool, srs, today)).toBe(1 + NEW_CARD_DAILY_CAP)
  })
  it('is zero when nothing is due and there are no new cards', () => {
    const pool = [mk(1)]
    const srs = { k1: { ef: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-07-25' } }
    expect(dueCount(pool, srs, today)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd interview-map && npx vitest run src/lib/srs.test.ts`
Expected: FAIL — `buildReviewDeck`/`dueCount`/`NEW_CARD_DAILY_CAP` not exported.

- [ ] **Step 3: Implement deck functions**

Append to `interview-map/src/lib/srs.ts`:

```ts
export const NEW_CARD_DAILY_CAP = 15

// Split a pool into due reviews + new cards for today's review session.
// Due = has an srs record with due <= today (most overdue first).
// New = no srs record, weak-domain-first, capped at NEW_CARD_DAILY_CAP.
export function buildReviewDeck<T extends { srsKey: string; domain: string }>(
  pool: T[],
  srs: SrsState,
  today: string,
  weakDomainsOrder: string[],
): T[] {
  const due = pool
    .filter((c) => srs[c.srsKey] && srs[c.srsKey].due <= today)
    .sort((a, b) => (srs[a.srsKey].due < srs[b.srsKey].due ? -1 : srs[a.srsKey].due > srs[b.srsKey].due ? 1 : 0))

  const rank = (domain: string) => {
    const i = weakDomainsOrder.indexOf(domain)
    return i === -1 ? weakDomainsOrder.length : i
  }
  const fresh = pool
    .filter((c) => !srs[c.srsKey])
    .sort((a, b) => rank(a.domain) - rank(b.domain))
    .slice(0, NEW_CARD_DAILY_CAP)

  return [...due, ...fresh]
}

// How many cards today's review would show: due + capped new. Used for badges.
export function dueCount<T extends { srsKey: string; domain: string }>(
  pool: T[],
  srs: SrsState,
  today: string,
): number {
  const due = pool.filter((c) => srs[c.srsKey] && srs[c.srsKey].due <= today).length
  const fresh = pool.filter((c) => !srs[c.srsKey]).length
  return due + Math.min(fresh, NEW_CARD_DAILY_CAP)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd interview-map && npx vitest run src/lib/srs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/lib/srs.ts interview-map/src/lib/srs.test.ts
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): buildReviewDeck + dueCount (due + capped new, weak-first)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 3: Store — `srs` state, `readGuestSrs`, `setSrs`, `recordReview`

**Files:**
- Modify: `interview-map/src/store/graphStore.ts`
- Test: `interview-map/src/store/graphStore.test.ts` (create)

**Interfaces:**
- Consumes: `review`, `type SrsState` (Task 1); `recordQuizResult(domain, correct)` (existing store action).
- Produces (on the store):
  - `SRS_KEY: string` (= `'interview-map.srs.v1'`)
  - `readGuestSrs(): SrsState`
  - `srs: SrsState`
  - `setSrs(srs: SrsState): void`
  - `recordReview(srsKey: string, item: { domain: string }, grade: number, today: string): void`
    — updates `srs[srsKey] = review(prev, grade, today)` AND calls the domain-level stat via the same update (increments quizStats for `item.domain`, correct = grade >= 3).

`recordReview` takes `today` explicitly (store stays free of ambient `new Date()` so it's testable and consistent with the pure engine).

- [ ] **Step 1: Write the failing test**

Create `interview-map/src/store/graphStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from './graphStore'

describe('recordReview', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ srs: {}, quizStats: {} })
  })

  it('creates an srs card on first review', () => {
    useGraphStore.getState().recordReview('k1', { domain: 'net' }, 5, '2026-07-21')
    const card = useGraphStore.getState().srs['k1']
    expect(card).toBeDefined()
    expect(card.reps).toBe(1)
    expect(card.due).toBe('2026-07-22')
  })

  it('also updates the domain-level quizStats (grade>=3 counts correct)', () => {
    useGraphStore.getState().recordReview('k1', { domain: 'net' }, 5, '2026-07-21')
    useGraphStore.getState().recordReview('k2', { domain: 'net' }, 0, '2026-07-21')
    expect(useGraphStore.getState().quizStats['net']).toEqual({ correct: 1, seen: 2 })
  })

  it('advances an existing card and bumps lapses on failure', () => {
    const s = useGraphStore.getState()
    s.recordReview('k1', { domain: 'net' }, 5, '2026-07-21')
    s.recordReview('k1', { domain: 'net' }, 0, '2026-07-22')
    const card = useGraphStore.getState().srs['k1']
    expect(card.reps).toBe(0)
    expect(card.lapses).toBe(1)
  })

  it('setSrs replaces state', () => {
    useGraphStore.getState().setSrs({ x: { ef: 2.5, interval: 6, reps: 2, lapses: 0, due: '2026-07-30' } })
    expect(Object.keys(useGraphStore.getState().srs)).toEqual(['x'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd interview-map && npx vitest run src/store/graphStore.test.ts`
Expected: FAIL — `recordReview`/`setSrs`/`srs` not on the store.

- [ ] **Step 3: Implement store changes**

In `interview-map/src/store/graphStore.ts`:

(a) Add import at top (after the existing imports):

```ts
import { review, type SrsState } from '../lib/srs'
```

(b) After the `readGuestQuizStats` block, add the SRS guest reader:

```ts
export const SRS_KEY = 'interview-map.srs.v1'
export function readGuestSrs(): SrsState {
  try {
    const s = localStorage.getItem(SRS_KEY)
    return s ? (JSON.parse(s) as SrsState) : {}
  } catch {
    return {}
  }
}
```

(c) In the `GraphState` interface, after the `setQuizStats` line, add:

```ts
  srs: SrsState                             // 카드별 간격반복 상태 (localStorage/클라우드)
  setSrs: (srs: SrsState) => void
  recordReview: (srsKey: string, item: { domain: string }, grade: number, today: string) => void
```

(d) In the store creator, after the `setQuizStats: ...` line, add:

```ts
  srs: readGuestSrs(),
  setSrs: (srs) => set({ srs }),
  recordReview: (srsKey, item, grade, today) => set((s) => {
    const nextSrs = { ...s.srs, [srsKey]: review(s.srs[srsKey], grade, today) }
    const cur = s.quizStats[item.domain] ?? { correct: 0, seen: 0 }
    const nextStats = {
      ...s.quizStats,
      [item.domain]: { correct: cur.correct + (grade >= 3 ? 1 : 0), seen: cur.seen + 1 },
    }
    return { srs: nextSrs, quizStats: nextStats }
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd interview-map && npx vitest run src/store/graphStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/store/graphStore.ts interview-map/src/store/graphStore.test.ts
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): store srs state + recordReview (updates card + domain stat)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 4: Cloud sync — `loadSrs` / `saveSrs` + Supabase column

**Files:**
- Modify: `interview-map/src/lib/cloudSync.ts`
- Modify: `docs/SUPABASE_SETUP.md`

**Interfaces:**
- Consumes: `SrsState` (Task 1); existing `supabase`, `logError` (same file).
- Produces:
  - `loadSrs(userId: string): Promise<SrsState | null>`
  - `saveSrs(userId: string, srs: SrsState): Promise<void>`

No unit test (thin Supabase I/O, mirrors existing `loadQuizStats`/`saveQuizStats`; verified end-to-end in Task 11 Playwright + manual cloud check). The manual DB step is required for cloud mode.

- [ ] **Step 1: Add the Supabase column (manual, required)**

Run this SQL in the Supabase SQL editor for project `eeptbpfiwqznkruyfqhv`:

```sql
alter table public.user_state
  add column if not exists srs jsonb not null default '{}'::jsonb;
```

Then document it — append to `docs/SUPABASE_SETUP.md` under the schema section:

```markdown

### SRS 컬럼 추가 (간격 반복 기능)

`user_state`에 카드별 간격반복 상태를 저장할 컬럼을 추가합니다:

```sql
alter table public.user_state
  add column if not exists srs jsonb not null default '{}'::jsonb;
```

기존 RLS(own-row) 정책이 컬럼과 무관하게 적용되므로 정책 변경은 필요 없습니다.
```

- [ ] **Step 2: Change the import in `cloudSync.ts`**

In `interview-map/src/lib/cloudSync.ts`, update the type import line:

```ts
import type { QuizStat } from '../store/graphStore'
import type { SrsState } from './srs'
```

- [ ] **Step 3: Add `loadSrs` / `saveSrs`**

Append to `interview-map/src/lib/cloudSync.ts`:

```ts
// Returns the user's srs state, or null when there is no row yet or Supabase
// is unconfigured/unreachable.
export async function loadSrs(userId: string): Promise<SrsState | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_state')
    .select('srs')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { logError('loadSrs', error); return null }
  if (!data) return null
  return (data.srs as SrsState | null) ?? {}
}

// Upsert only srs (+ updated_at); other columns are left untouched.
export async function saveSrs(userId: string, srs: SrsState): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('user_state')
    .upsert({ user_id: userId, srs, updated_at: new Date().toISOString() })
  logError('saveSrs', error)
}
```

- [ ] **Step 4: Type-check**

Run: `cd interview-map && npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/lib/cloudSync.ts docs/SUPABASE_SETUP.md
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): cloud loadSrs/saveSrs + document srs column SQL

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 5: `useCloudSync` — integrate srs (guest/cloud separation)

**Files:**
- Modify: `interview-map/src/hooks/useCloudSync.ts`

**Interfaces:**
- Consumes: `readGuestSrs`, `SRS_KEY`, `setSrs`, `srs` (Task 3); `loadSrs`, `saveSrs` (Task 4); `type SrsState` (Task 1).
- Produces: nothing new (behavior only). srs now follows the exact same guest↔cloud lifecycle as studiedIds/quizStats.

No unit test (React effect orchestration; the project verifies this hook via Playwright — Task 11).

- [ ] **Step 1: Update imports**

In `interview-map/src/hooks/useCloudSync.ts`, replace the two import blocks:

```ts
import {
  useGraphStore, PROGRESS_KEY, QUIZSTATS_KEY, SRS_KEY,
  readGuestStudied, readGuestQuizStats, readGuestSrs,
  type QuizStat,
} from '../store/graphStore'
import { loadStudied, saveStudied, loadQuizStats, saveQuizStats, loadSrs, saveSrs } from '../lib/cloudSync'
import type { SrsState } from '../lib/srs'
```

- [ ] **Step 2: Add store selectors + guest ref**

After the `const quizStats = useGraphStore((s) => s.quizStats)` line, add:

```ts
  const setSrs = useGraphStore((s) => s.setSrs)
  const srs = useGraphStore((s) => s.srs)
```

After `const guestQuizRef = useRef<Record<string, QuizStat>>(readGuestQuizStats())`, add:

```ts
  const guestSrsRef = useRef<SrsState>(readGuestSrs())
```

- [ ] **Step 3: Include srs in the mode-switch effect**

In the mode-switch `useEffect`, in the logout branch add `setSrs(guestSrsRef.current)` next to the other restores:

```ts
      if (wasLoggedInRef.current) {
        setStudiedIds(guestStudiedRef.current)
        setQuizStats(guestQuizRef.current)
        setSrs(guestSrsRef.current)
        wasLoggedInRef.current = false
      }
```

In the login branch, extend the `Promise.all` and the replace:

```ts
      const [cloudStudied, cloudStats, cloudSrs] = await Promise.all([
        loadStudied(user.id),
        loadQuizStats(user.id),
        loadSrs(user.id),
      ])
      if (cancelled) return
      setStudiedIds(cloudStudied ?? [])
      setQuizStats(cloudStats ?? {})
      setSrs(cloudSrs ?? {})
```

Update the effect dependency array to include `setSrs`:

```ts
  }, [user, setStudiedIds, setQuizStats, setSrs])
```

- [ ] **Step 4: Add the srs write-through effect**

After the `quizStats` write-through `useEffect`, add:

```ts
  useEffect(() => {
    if (!readyRef.current) return
    const u = userRef.current
    if (u) { void saveSrs(u.id, srs); return }
    guestSrsRef.current = srs
    try { localStorage.setItem(SRS_KEY, JSON.stringify(srs)) } catch { /* ignore */ }
  }, [srs])
```

- [ ] **Step 5: Type-check and commit**

Run: `cd interview-map && npx tsc -b`
Expected: no errors.

```bash
git add interview-map/src/hooks/useCloudSync.ts
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): sync srs through useCloudSync (guest/cloud fully separate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 6: `useNotePool` — attach `srsKey` to items

**Files:**
- Modify: `interview-map/src/hooks/useNotePool.ts`

**Interfaces:**
- Consumes: `srsKeyOf` (Task 1); existing `RawQuizItem { question, answer }` shape via the generic extract. `srsKeyOf` needs the question string, so it is derived only when a `question` field is present.
- Produces: `NoteContext` gains `srsKey: string`. Every item from `buildItems` now carries `srsKey` (empty string for items without a `question` field, e.g. drill chains — they don't use it).

- [ ] **Step 1: Update `NoteContext` and imports**

In `interview-map/src/hooks/useNotePool.ts`, add the import near the top:

```ts
import { srsKeyOf } from '../lib/srs'
```

Extend the interface:

```ts
export interface NoteContext {
  domain: string
  nodeId: string
  nodeLabel: string
  key: string
  srsKey: string
}
```

- [ ] **Step 2: Populate `srsKey` in the push**

In the `raws.forEach(...)` block, replace the push with one that derives `srsKey` from a `question` field when present:

```ts
          raws.forEach((r, i) => {
            const q = (r as { question?: string }).question
            out.push({
              ...r,
              domain,
              nodeId,
              nodeLabel,
              key: `${path}#${s.slug}#${i}`,
              srsKey: q ? srsKeyOf(path, s.slug, q) : '',
            })
          })
```

- [ ] **Step 3: Type-check**

Run: `cd interview-map && npx tsc -b`
Expected: no errors. (Existing consumers — QuizView/DrillView — still compile; they just gain an unused `srsKey` field.)

- [ ] **Step 4: Run the full unit suite (regression)**

Run: `cd interview-map && npx vitest run`
Expected: PASS (no test consumes `srsKey` yet; nothing breaks).

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/hooks/useNotePool.ts
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): attach stable srsKey to note-pool items

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 7: QuizView — seed SRS from the 2-button assessment

**Files:**
- Modify: `interview-map/src/components/QuizView.tsx`

**Interfaces:**
- Consumes: `recordReview(srsKey, item, grade, today)` (Task 3); `card.srsKey` (Task 6); existing local `todayStr()`.
- Produces: nothing new. Flashcard 몰랐음/알았음 now writes a per-card SRS record (grade 0 / 4) in addition to the domain stat. The domain stat is updated **inside** `recordReview`, so the separate `recordQuizResult` call is removed to avoid double-counting.

- [ ] **Step 1: Swap the store action**

In `interview-map/src/components/QuizView.tsx`, replace the selector:

```ts
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
```

with:

```ts
  const recordReview = useGraphStore((s) => s.recordReview)
```

- [ ] **Step 2: Update `assess` to seed SRS**

Replace the `assess` line:

```ts
  const assess = (correct: boolean) => { if (card) recordQuizResult(card.domain, correct); advance() }
```

with:

```ts
  const assess = (correct: boolean) => {
    if (card) recordReview(card.srsKey, card, correct ? 4 : 0, todayStr())
    advance()
  }
```

- [ ] **Step 3: Type-check**

Run: `cd interview-map && npx tsc -b`
Expected: no errors. (`recordQuizResult` is no longer referenced in this file; `quizStats`/`weakDomains` usage for the 약점 chips is unchanged.)

- [ ] **Step 4: Run the full unit suite (regression)**

Run: `cd interview-map && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/components/QuizView.tsx
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): flashcard assessment seeds per-card SRS schedule

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 8: ReviewView — 3-button spaced-repetition UI

**Files:**
- Create: `interview-map/src/components/ReviewView.tsx`
- Create: `interview-map/src/components/ReviewView.css`

**Interfaces:**
- Consumes: `useNotePool` + `extractQuizItems` (existing); `buildReviewDeck`, `type SrsState` (Tasks 1–2); `weakDomains` from `lib/quiz`; store `srs`, `recordReview`, `select`, `setViewMode`; `domainColor` from `styles/theme`.
- Produces: `export function ReviewView({ nodes }: { nodes: GraphNode[] })`.

Behavior: builds the review deck once per mount (frozen for the session so cards leaving `due` after grading don't reshuffle mid-session), steps through it, reveals answer, 3 buttons grade the card via `recordReview(srsKey, item, grade, today)`, advances. Empty/finished → completion message with the next due date.

- [ ] **Step 1: Create `ReviewView.tsx`**

Create `interview-map/src/components/ReviewView.tsx`:

```tsx
import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { LuArrowRight } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractQuizItems, weakDomains } from '../lib/quiz'
import { buildReviewDeck, addDays } from '../lib/srs'
import { useNotePool } from '../hooks/useNotePool'
import { domainColor } from '../styles/theme'
import type { GraphNode } from '../graph/types'
import './ReviewView.css'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const GRADES = [
  { grade: 0, label: '모름', cls: 'review-g0' },
  { grade: 3, label: '애매', cls: 'review-g3' },
  { grade: 5, label: '쉬움', cls: 'review-g5' },
]

// Spaced-repetition review: today's due + new cards, graded on a 3-point scale.
export function ReviewView({ nodes }: { nodes: GraphNode[] }) {
  const select = useGraphStore((s) => s.select)
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const srs = useGraphStore((s) => s.srs)
  const quizStats = useGraphStore((s) => s.quizStats)
  const recordReview = useGraphStore((s) => s.recordReview)

  const { loading, buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])

  // Freeze the deck for the session: grading a card changes `srs`, which would
  // otherwise rebuild the deck and drop the just-graded card mid-run.
  const today = todayStr()
  const deck = useMemo(() => {
    const weakOrder = weakDomains(quizStats, { limit: 99 }).map((w) => w.domain)
    return buildReviewDeck(pool, srs, today, weakOrder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool])

  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  if (loading) return <div className="review"><p className="review-dim">복습 카드 불러오는 중…</p></div>

  const card = deck[index]
  const grade = (g: number) => {
    if (card) recordReview(card.srsKey, card, g, today)
    setIndex((i) => i + 1)
    setRevealed(false)
  }

  if (!card) {
    // Finished the deck (or nothing was due). Show the soonest upcoming due date.
    const upcoming = pool
      .map((c) => srs[c.srsKey]?.due)
      .filter((d): d is string => !!d && d > today)
      .sort()
    const done = deck.length > 0
    return (
      <div className="review">
        <div className="review-empty">
          <p className="review-empty-title">{done ? '오늘 복습 완료 🎉' : '복습할 카드가 아직 없어요'}</p>
          {upcoming.length > 0
            ? <p className="review-dim">다음 복습: {upcoming[0]}</p>
            : <p className="review-dim">플래시카드를 몇 개 풀면 복습 일정이 생겨요.</p>}
          <button className="review-link" onClick={() => setViewMode('quiz')}>
            플래시카드로 채우기 <LuArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="review">
      <div className="review-card" style={{ ['--c' as string]: domainColor(card.domain) }}>
        <div className="review-meta">
          <span className="review-count">{index + 1} / {deck.length}</span>
          <span className="review-badge">{card.nodeLabel}</span>
        </div>
        <p className="review-q">{card.question}</p>

        {revealed ? (
          <div className="review-a">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{card.answer}</Markdown>
          </div>
        ) : (
          <button className="review-reveal" onClick={() => setRevealed(true)}>답 보기</button>
        )}

        <div className="review-actions">
          <button className="review-link" onClick={() => { select(card.nodeId); setViewMode('list') }}>
            이 개념 보기 <LuArrowRight size={14} />
          </button>
          {revealed && (
            <div className="review-grades">
              {GRADES.map((g) => (
                <button key={g.grade} className={`review-grade ${g.cls}`} onClick={() => grade(g.grade)}>
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `ReviewView.css`**

Create `interview-map/src/components/ReviewView.css` (mirrors `.quiz`/`.drill` layout — scrollable flex child of `.quiztab`):

```css
.review {
  flex: 1; min-height: 0; width: 100%; overflow-y: auto;
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  padding: 8px 20px 20px;
}
.review-dim { color: var(--text-dim); font-size: 14px; }

.review-card {
  width: 100%; max-width: 640px;
  border: 1px solid var(--border); border-left: 4px solid var(--c, var(--accent));
  border-radius: 14px; background: var(--bg-panel); padding: 20px;
}
.review-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.review-count { font-size: 12px; color: var(--text-dim); }
.review-badge { font-size: 12px; font-weight: 600; color: var(--c, var(--accent)); }
.review-q { font-size: 17px; font-weight: 700; line-height: 1.5; margin: 0 0 14px; }
.review-a { font-size: 14px; line-height: 1.6; color: var(--text); }
.review-reveal {
  font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 8px;
  border: 1px dashed var(--border); background: transparent; color: var(--text-dim); cursor: pointer;
}

.review-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 18px; flex-wrap: wrap; }
.review-link {
  display: inline-flex; align-items: center; gap: 4px; font-size: 13px;
  background: none; border: none; color: var(--accent); cursor: pointer; padding: 0;
}
.review-grades { display: inline-flex; gap: 8px; }
.review-grade {
  font-size: 13px; font-weight: 700; padding: 8px 18px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); cursor: pointer;
}
.review-g0 { border-color: #e5484d; color: #e5484d; }
.review-g3 { border-color: #f5a623; color: #f5a623; }
.review-g5 { border-color: #30a46c; color: #30a46c; }

.review-empty { text-align: center; margin-top: 48px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.review-empty-title { font-size: 18px; font-weight: 700; margin: 0; }
```

- [ ] **Step 3: Type-check**

Run: `cd interview-map && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add interview-map/src/components/ReviewView.tsx interview-map/src/components/ReviewView.css
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): ReviewView — 3-button spaced-repetition UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 9: QuizTab — 3rd toggle `🔁 복습(N)` with due badge

**Files:**
- Modify: `interview-map/src/components/QuizTab.tsx`
- Modify: `interview-map/src/components/QuizTab.css`

**Interfaces:**
- Consumes: `ReviewView` (Task 8); `useNotePool` + `extractQuizItems`; `dueCount`, `type SrsState` (Tasks 1–2); store `srs`.
- Produces: `mode` type extended to `'flash' | 'drill' | 'review'`. Toggle shows the review due count.

The due count needs the same pool the views build. Compute it in `QuizTab` via `useNotePool` (the hook fetches notes once; calling it in QuizTab and again in the child view is fine — results are cached per hook instance, and the extra fetch is cheap/deduped by the browser).

- [ ] **Step 1: Rewrite `QuizTab.tsx`**

Replace the contents of `interview-map/src/components/QuizTab.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { QuizView } from './QuizView'
import { DrillView } from './DrillView'
import { ReviewView } from './ReviewView'
import { useGraphStore } from '../store/graphStore'
import { useNotePool } from '../hooks/useNotePool'
import { extractQuizItems } from '../lib/quiz'
import { dueCount } from '../lib/srs'
import type { GraphNode } from '../graph/types'
import './QuizTab.css'

type QuizMode = 'flash' | 'drill' | 'review'

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Quiz tab shell: flashcard practice, interview drill-down, and SRS review.
export function QuizTab({ nodes }: { nodes: GraphNode[] }) {
  const [mode, setMode] = useState<QuizMode>('flash')
  const srs = useGraphStore((s) => s.srs)
  const { buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])
  const due = useMemo(() => dueCount(pool, srs, todayStr()), [pool, srs])

  return (
    <div className="quiztab">
      <div className="quiztab-modes" role="tablist" aria-label="퀴즈 모드">
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'flash'}
          data-active={mode === 'flash'} onClick={() => setMode('flash')}>
          플래시카드
        </button>
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'drill'}
          data-active={mode === 'drill'} onClick={() => setMode('drill')}>
          🎤 드릴다운
        </button>
        <button className="quiztab-mode" role="tab" aria-selected={mode === 'review'}
          data-active={mode === 'review'} onClick={() => setMode('review')}>
          🔁 복습{due > 0 && <span className="quiztab-badge">{due}</span>}
        </button>
      </div>
      {mode === 'flash' && <QuizView nodes={nodes} />}
      {mode === 'drill' && <DrillView nodes={nodes} />}
      {mode === 'review' && <ReviewView nodes={nodes} />}
    </div>
  )
}
```

- [ ] **Step 2: Add the badge style**

Append to `interview-map/src/components/QuizTab.css`:

```css
.quiztab-badge {
  display: inline-block; margin-left: 6px; padding: 0 6px; min-width: 16px;
  font-size: 11px; font-weight: 700; line-height: 16px; text-align: center;
  border-radius: 999px; background: var(--accent); color: #fff;
}
.quiztab-mode[data-active='true'] .quiztab-badge { background: #fff; color: var(--accent); }
```

- [ ] **Step 3: Type-check**

Run: `cd interview-map && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add interview-map/src/components/QuizTab.tsx interview-map/src/components/QuizTab.css
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): quiz tab review toggle with due-count badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 10: HomeView — due badge on the '면접 퀴즈' card

**Files:**
- Modify: `interview-map/src/components/HomeView.tsx`

**Interfaces:**
- Consumes: `useNotePool` + `extractQuizItems`; `dueCount` (Task 2); store `srs`.
- Produces: nothing new. The 면접 퀴즈 card shows `🔁 오늘 N개` when `due > 0`.

Note: `HomeView` currently takes no props and renders static cards. It needs `nodes` to build the pool for the due count. Update the call site in `App.tsx` accordingly.

- [ ] **Step 1: Add nodes prop + due count to `HomeView.tsx`**

In `interview-map/src/components/HomeView.tsx`:

(a) Update imports:

```tsx
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { LuMap, LuBrain, LuRoute, LuArrowRight } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import type { ViewMode } from '../store/graphStore'
import { useNotePool } from '../hooks/useNotePool'
import { extractQuizItems } from '../lib/quiz'
import { dueCount } from '../lib/srs'
import type { GraphNode } from '../graph/types'
import './HomeView.css'
```

(b) Add a `todayStr` helper above the component:

```tsx
function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
```

(c) Change the component signature and compute due; render the badge on the quiz card:

```tsx
export function HomeView({ nodes }: { nodes: GraphNode[] }) {
  const setViewMode = useGraphStore((s) => s.setViewMode)
  const srs = useGraphStore((s) => s.srs)
  const { buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])
  const due = useMemo(() => dueCount(pool, srs, todayStr()), [pool, srs])

  return (
    <div className="home">
      <header className="home-hero">
        <h1>CS · 백엔드 면접 지도</h1>
        <p>개념을 잇고 · 면접처럼 파고들고 · 순서대로 정복</p>
      </header>
      <div className="home-cards">
        {CARDS.map((c) => (
          <button key={c.target} className="home-card" onClick={() => setViewMode(c.target)}>
            <span className="home-card-icon">{c.icon}</span>
            <span className="home-card-title">{c.title}</span>
            <span className="home-card-desc">{c.desc}</span>
            {c.target === 'quiz' && due > 0 && (
              <span className="home-card-badge">🔁 오늘 {due}개</span>
            )}
            <span className="home-card-cta">{c.cta} <LuArrowRight size={14} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the badge style**

Append to `interview-map/src/components/HomeView.css`:

```css
.home-card-badge {
  align-self: flex-start; padding: 2px 8px; border-radius: 999px;
  font-size: 12px; font-weight: 700; background: var(--accent); color: #fff;
}
```

- [ ] **Step 3: Pass `nodes` from `App.tsx`**

In `interview-map/src/App.tsx`, update the HomeView render to pass nodes (it already passes `data.nodes` to QuizTab):

```tsx
{viewMode === 'home' && <HomeView nodes={data.nodes} />}
```

- [ ] **Step 4: Type-check**

Run: `cd interview-map && npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/components/HomeView.tsx interview-map/src/components/HomeView.css interview-map/src/App.tsx
git -c user.email="30681841+valorjj@users.noreply.github.com" commit -m "$(cat <<'EOF'
feat(srs): home '면접 퀴즈' card shows today's review count

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hknbru5nWNsFfmV3iJpBGh
EOF
)"
```

---

## Task 11: Full verification (unit + build + real browser)

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `cd interview-map && npx vitest run`
Expected: PASS (srs, graphStore, and all existing suites).

- [ ] **Step 2: Production build**

Run: `cd interview-map && npm run build`
Expected: `tsc -b` clean + `vite build` succeeds → `dist/`.

- [ ] **Step 3: Real-browser check (Playwright, guest mode)**

Create `scratchpad` script and run it with the dev server up (`cd interview-map && npm run dev` in another shell). Playwright import path per project convention:

```js
import pkg from '/Users/jeongjin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js'
const { chromium } = pkg

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('http://localhost:5173')

// Go to quiz tab → flashcard: answer a few to seed SRS.
await page.getByRole('button', { name: '퀴즈' }).click()
await page.getByRole('button', { name: '답 보기' }).click()
await page.getByRole('button', { name: '알았음' }).click()

// Switch to review toggle; badge should reflect due+new.
await page.getByRole('tab', { name: /복습/ }).click()
await page.waitForTimeout(300)

// Grade one card on the 3-point scale.
const reveal = page.getByRole('button', { name: '답 보기' })
if (await reveal.isVisible().catch(() => false)) {
  await reveal.click()
  await page.getByRole('button', { name: '쉬움' }).click()
}

// Reload → schedule persists (guest localStorage).
await page.reload()
await page.getByRole('button', { name: '퀴즈' }).click()
await page.getByRole('tab', { name: /복습/ }).click()

console.log('CONSOLE ERRORS:', errors)
await browser.close()
```

Run: `node <scratchpad>/verify-srs.mjs`
Expected: `CONSOLE ERRORS: []`; review toggle shows a badge; grading advances; reload keeps schedule.

- [ ] **Step 4: Clean up scratchpad script** (no commit — verification only).

---

## Self-Review

**Spec coverage:**
- 카드 단위 SM-2 → Task 1 (`review`). ✅
- srsKey 안정화 → Task 1 (`srsKeyOf`) + Task 6. ✅
- 덱(due+신규 상한 약점우선) + dueCount → Task 2. ✅
- 저장(게스트 localStorage / 클라우드 srs 컬럼) + 완전분리 → Tasks 3,4,5. ✅
- Supabase 컬럼 SQL → Task 4. ✅
- 플래시카드 씨딩(2버튼→grade 0/4, 도메인 통계 중복 제거) → Tasks 3,7. ✅
- 복습 3버튼 UI + 빈/완료 상태 → Task 8. ✅
- 퀴즈 3번째 토글 + 배지 → Task 9. ✅
- 홈 배지 → Task 10. ✅
- Vitest(순수·store) + Playwright + build → Tasks 1,2,3,11. ✅

**Placeholder scan:** none — every code step shows full code.

**Type consistency:**
- `SrsCard`/`SrsState` used identically in Tasks 1–8. ✅
- `recordReview(srsKey, item, grade, today)` signature identical in store (Task 3), QuizView (Task 7), ReviewView (Task 8). ✅
- `buildReviewDeck(pool, srs, today, weakDomainsOrder)` / `dueCount(pool, srs, today)` identical in Tasks 2, 8, 9, 10. ✅
- `NoteContext.srsKey` added in Task 6, consumed in Tasks 7–10. ✅
