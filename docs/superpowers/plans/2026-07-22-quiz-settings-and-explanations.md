# Quiz Settings & Explanations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick the flashcard ordering and adjust SRS parameters in the quiz tab, and explain each algorithm in-app via ℹ️ popovers.

**Architecture:** A local-only `QuizSettings` object lives in the zustand `graphStore` (hydrated synchronously from localStorage, not cloud-synced). A pure `orderDeck` function in `quiz.ts` produces the flashcard order from the setting. `srs.ts` gains a `cap` parameter and a `GRADE_SETS` table. UI wiring adds an order selector + reshuffle to `QuizView`, a settings ⚙️ popover + mode ℹ️ to `QuizTab`, variable grade buttons to `ReviewView`, and a reusable `InfoPopover` component fed by help strings in `quizHelp.ts`.

**Tech Stack:** Vite + React 18 + TypeScript, zustand, vitest, react-icons/lu.

## Global Constraints

- Korean UI copy + Korean code comments where the file already comments in Korean; English identifiers.
- This is a PUBLIC repo — no company secrets/personal data in commits.
- Commit author/committer email MUST be `30681841+valorjj@users.noreply.github.com` (set via `GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_EMAIL` env on each commit).
- Every commit message ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Work on a feature branch off `main`; ff-merge to `main` and delete the branch at the end.
- Run all commands from `interview-map/` (the Vite app root) unless noted.
- `npx vitest run` must stay green (currently 102 tests). After any `graph.json`/settings change affecting the built bundle, `npm run build` before Playwright preview verification.
- Settings are device preferences: **local-only, not added to `useCloudSync`.**
- Do NOT expose SRS internal values (ease factor, interval steps) as controls — explanation only.
- Do NOT change the flashcard O/X (몰랐음/알았음) button count; the grade-button-count setting applies to Review mode only.

## File Structure

- **Create** `interview-map/src/lib/quizSettings.ts` — `QuizSettings` type, `DEFAULT_QUIZ_SETTINGS`, `QUIZSETTINGS_KEY`, `readQuizSettings()`.
- **Create** `interview-map/src/lib/quizHelp.ts` — Korean help strings (`MODE_HELP`, `ORDER_HELP`, `ORDER_LABELS`, `SRS_HELP`).
- **Create** `interview-map/src/components/InfoPopover.tsx` + `InfoPopover.css` — reusable ℹ️ popover.
- **Modify** `interview-map/src/lib/quiz.ts` — add `OrderCtx` + `orderDeck`.
- **Modify** `interview-map/src/lib/srs.ts` — add `cap` param to `buildReviewDeck`/`dueCount`; add `GRADE_SETS`.
- **Modify** `interview-map/src/store/graphStore.ts` — `quizSettings` state + `setQuizSettings`.
- **Modify** `interview-map/src/components/QuizView.tsx` — order selector + ℹ️ + reshuffle; use `orderDeck`.
- **Modify** `interview-map/src/components/QuizView.css` — order selector styles.
- **Modify** `interview-map/src/components/ReviewView.tsx` — grade buttons from `GRADE_SETS`; cap into `buildReviewDeck`.
- **Modify** `interview-map/src/components/ReviewView.css` — `.review-g2` / `.review-g4` colors.
- **Modify** `interview-map/src/components/QuizTab.tsx` — ⚙️ settings popover, mode ℹ️, cap into `dueCount`.
- **Modify** `interview-map/src/components/QuizTab.css` — header row / gear / settings panel styles.
- **Test** `interview-map/src/lib/quiz.test.ts`, `interview-map/src/lib/srs.test.ts`, `interview-map/src/store/graphStore.test.ts`.

**Pool item shape** (from `useNotePool` `buildItems(extractQuizItems)`): `{ question: string; answer: string; domain: string; nodeId: string; nodeLabel: string; key: string; srsKey: string }`.

---

### Task 1: QuizSettings model + store integration

**Files:**
- Create: `interview-map/src/lib/quizSettings.ts`
- Modify: `interview-map/src/store/graphStore.ts`
- Test: `interview-map/src/store/graphStore.test.ts`

**Interfaces:**
- Produces: `QuizSettings` (`{ order: 'daily'|'random'|'sequential'|'weak'; newCardCap: number; gradeButtons: 2|3|5 }`), `DEFAULT_QUIZ_SETTINGS`, `QUIZSETTINGS_KEY`, `readQuizSettings(): QuizSettings`. Store gains `quizSettings: QuizSettings` and `setQuizSettings(patch: Partial<QuizSettings>): void`.

- [ ] **Step 1: Create the settings module**

Create `interview-map/src/lib/quizSettings.ts`:

```ts
// User-tunable quiz preferences. Device-local (localStorage), NOT cloud-synced —
// these are ergonomics, not learning data. Merged over defaults on read so a
// partial or older stored blob still yields a complete, valid object.
export interface QuizSettings {
  order: 'daily' | 'random' | 'sequential' | 'weak' // 플래시카드 카드 순서
  newCardCap: number   // 하루 새 카드 상한. 0 = 무제한
  gradeButtons: 2 | 3 | 5 // 복습 난이도 버튼 개수
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  order: 'daily',
  newCardCap: 15,
  gradeButtons: 3,
}

export const QUIZSETTINGS_KEY = 'interview-map.quizsettings.v1'

export function readQuizSettings(): QuizSettings {
  try {
    const s = localStorage.getItem(QUIZSETTINGS_KEY)
    if (!s) return { ...DEFAULT_QUIZ_SETTINGS }
    const parsed = JSON.parse(s) as Partial<QuizSettings>
    return { ...DEFAULT_QUIZ_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_QUIZ_SETTINGS }
  }
}
```

- [ ] **Step 2: Add store state + setter**

In `interview-map/src/store/graphStore.ts`:

Add import near the top (after the existing `srs` import on line 3):

```ts
import { QuizSettings, DEFAULT_QUIZ_SETTINGS, QUIZSETTINGS_KEY, readQuizSettings } from '../lib/quizSettings'
```

Add to the `GraphState` interface (after the `srs` block, before `pathTrackId`):

```ts
  quizSettings: QuizSettings                // 퀴즈 순서·SRS 취향값 (localStorage 전용)
  setQuizSettings: (patch: Partial<QuizSettings>) => void
```

Add to the store body (after the `setSrs`/`recordReview` block, before `pathTrackId`):

```ts
  quizSettings: readQuizSettings(),
  setQuizSettings: (patch) => set((s) => {
    const next = { ...s.quizSettings, ...patch }
    try { localStorage.setItem(QUIZSETTINGS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return { quizSettings: next }
  }),
```

- [ ] **Step 3: Write the failing test**

Append to `interview-map/src/store/graphStore.test.ts`:

```ts
import { QUIZSETTINGS_KEY, DEFAULT_QUIZ_SETTINGS } from '../lib/quizSettings'

describe('setQuizSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ quizSettings: { ...DEFAULT_QUIZ_SETTINGS } })
  })

  it('merges a partial patch over current settings', () => {
    useGraphStore.getState().setQuizSettings({ order: 'random' })
    expect(useGraphStore.getState().quizSettings).toEqual({
      order: 'random', newCardCap: 15, gradeButtons: 3,
    })
  })

  it('persists to localStorage', () => {
    useGraphStore.getState().setQuizSettings({ newCardCap: 30 })
    expect(JSON.parse(localStorage.getItem(QUIZSETTINGS_KEY)!)).toEqual({
      order: 'daily', newCardCap: 30, gradeButtons: 3,
    })
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd interview-map && npx vitest run src/store/graphStore.test.ts`
Expected: PASS (existing `recordReview` tests + 2 new `setQuizSettings` tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/lib/quizSettings.ts interview-map/src/store/graphStore.ts interview-map/src/store/graphStore.test.ts
GIT_AUTHOR_EMAIL="30681841+valorjj@users.noreply.github.com" GIT_COMMITTER_EMAIL="30681841+valorjj@users.noreply.github.com" \
  git commit -m "feat(quiz): local QuizSettings store (order, cap, grade buttons)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `orderDeck` pure function

**Files:**
- Modify: `interview-map/src/lib/quiz.ts`
- Test: `interview-map/src/lib/quiz.test.ts`

**Interfaces:**
- Consumes: `seededShuffle` (already in `quiz.ts`), `QuizSettings['order']` from `../lib/quizSettings`.
- Produces: `OrderCtx` (`{ seed: number; srsLapses: (srsKey: string) => number; weakRank: (domain: string) => number }`) and `orderDeck<T extends { srsKey: string; domain: string }>(scoped: T[], order: QuizSettings['order'], ctx: OrderCtx): T[]`.

- [ ] **Step 1: Write the failing test**

Append to `interview-map/src/lib/quiz.test.ts`:

```ts
import { orderDeck, type OrderCtx } from './quiz'

describe('orderDeck', () => {
  const items = [
    { srsKey: 'a', domain: 'os' },
    { srsKey: 'b', domain: 'net' },
    { srsKey: 'c', domain: 'db' },
    { srsKey: 'd', domain: 'os' },
  ]
  const ctx = (over: Partial<OrderCtx> = {}): OrderCtx => ({
    seed: 1, srsLapses: () => 0, weakRank: () => 0, ...over,
  })

  it('sequential keeps input order and does not mutate input', () => {
    const input = items.slice()
    const out = orderDeck(input, 'sequential', ctx())
    expect(out.map((i) => i.srsKey)).toEqual(['a', 'b', 'c', 'd'])
    expect(input.map((i) => i.srsKey)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('daily/random are deterministic for a seed and differ across seeds', () => {
    const s1 = orderDeck(items, 'random', ctx({ seed: 111 })).map((i) => i.srsKey)
    const s1again = orderDeck(items, 'random', ctx({ seed: 111 })).map((i) => i.srsKey)
    const s2 = orderDeck(items, 'random', ctx({ seed: 222 })).map((i) => i.srsKey)
    expect(s1).toEqual(s1again)
    expect(s1).not.toEqual(s2)
  })

  it('weak puts previously-wrong cards (lapses>0) first, then weakest domain', () => {
    const lapses: Record<string, number> = { c: 2, d: 1 }
    const rank: Record<string, number> = { db: 0, os: 1, net: 2 }
    const out = orderDeck(items, 'weak', ctx({
      srsLapses: (k) => lapses[k] ?? 0,
      weakRank: (d) => rank[d] ?? 99,
    })).map((i) => i.srsKey)
    // lapsed first (c domain=db rank0, d domain=os rank1) → c, d;
    // then non-lapsed by weakRank (b domain=net rank2, a domain=os rank1) → a, b
    expect(out).toEqual(['c', 'd', 'a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd interview-map && npx vitest run src/lib/quiz.test.ts`
Expected: FAIL — `orderDeck` / `OrderCtx` not exported.

- [ ] **Step 3: Implement `orderDeck`**

Append to `interview-map/src/lib/quiz.ts` (after `seededShuffle`, before `weakDomains`):

```ts
import type { QuizSettings } from './quizSettings'

export interface OrderCtx {
  seed: number                            // daily/random 셔플 시드
  srsLapses: (srsKey: string) => number   // 카드별 이전 오답 횟수 (weak용)
  weakRank: (domain: string) => number    // 약점 도메인 순위 (낮을수록 약함)
}

// Flashcard deck ordering by user setting. Pure; input array is never mutated.
//   daily/random → seeded Fisher-Yates (caller varies the seed)
//   sequential   → note order (input order) unchanged
//   weak         → previously-wrong cards first, then weakest domain first
export function orderDeck<T extends { srsKey: string; domain: string }>(
  scoped: T[], order: QuizSettings['order'], ctx: OrderCtx,
): T[] {
  if (order === 'sequential') return scoped.slice()
  if (order === 'weak') {
    return scoped
      .map((item, i) => ({ item, i }))
      .sort((a, b) => {
        const aw = ctx.srsLapses(a.item.srsKey) > 0 ? 0 : 1
        const bw = ctx.srsLapses(b.item.srsKey) > 0 ? 0 : 1
        if (aw !== bw) return aw - bw
        const ar = ctx.weakRank(a.item.domain)
        const br = ctx.weakRank(b.item.domain)
        if (ar !== br) return ar - br
        return a.i - b.i // stable
      })
      .map((x) => x.item)
  }
  return seededShuffle(scoped, ctx.seed) // daily & random
}
```

Note: TypeScript's `Array.prototype.sort` is stable, but the `a.i - b.i` tiebreak makes stability explicit and test-proof.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd interview-map && npx vitest run src/lib/quiz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/lib/quiz.ts interview-map/src/lib/quiz.test.ts
GIT_AUTHOR_EMAIL="30681841+valorjj@users.noreply.github.com" GIT_COMMITTER_EMAIL="30681841+valorjj@users.noreply.github.com" \
  git commit -m "feat(quiz): orderDeck pure fn (daily/random/sequential/weak)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: SRS `cap` parameter + `GRADE_SETS`

**Files:**
- Modify: `interview-map/src/lib/srs.ts:63-94`
- Test: `interview-map/src/lib/srs.test.ts`

**Interfaces:**
- Produces: `buildReviewDeck(pool, srs, today, weakDomainsOrder, cap = NEW_CARD_DAILY_CAP)`, `dueCount(pool, srs, today, cap = NEW_CARD_DAILY_CAP)`, and `GRADE_SETS: Record<2|3|5, { grade: number; label: string; cls: string }[]>`.

- [ ] **Step 1: Write the failing test**

Append to `interview-map/src/lib/srs.test.ts`:

```ts
import { buildReviewDeck, dueCount, GRADE_SETS, NEW_CARD_DAILY_CAP } from './srs'

describe('buildReviewDeck cap', () => {
  const today = '2026-07-22'
  const pool = Array.from({ length: 25 }, (_, i) => ({ srsKey: `k${i}`, domain: 'os' }))

  it('caps new cards at the given cap', () => {
    expect(buildReviewDeck(pool, {}, today, [], 10)).toHaveLength(10)
  })

  it('defaults to NEW_CARD_DAILY_CAP when cap omitted', () => {
    expect(buildReviewDeck(pool, {}, today, [])).toHaveLength(NEW_CARD_DAILY_CAP)
  })

  it('Infinity cap returns all new cards', () => {
    expect(buildReviewDeck(pool, {}, today, [], Infinity)).toHaveLength(25)
  })
})

describe('dueCount cap', () => {
  const today = '2026-07-22'
  const pool = Array.from({ length: 25 }, (_, i) => ({ srsKey: `k${i}`, domain: 'os' }))
  it('respects the cap for new cards', () => {
    expect(dueCount(pool, {}, today, 10)).toBe(10)
    expect(dueCount(pool, {}, today, Infinity)).toBe(25)
  })
})

describe('GRADE_SETS', () => {
  it('has 2/3/5 button sets with ascending grades', () => {
    for (const n of [2, 3, 5] as const) {
      const set = GRADE_SETS[n]
      expect(set).toHaveLength(n)
      const grades = set.map((g) => g.grade)
      expect(grades).toEqual([...grades].sort((a, b) => a - b))
      expect(grades[0]).toBe(0)
      expect(grades[grades.length - 1]).toBe(5)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd interview-map && npx vitest run src/lib/srs.test.ts`
Expected: FAIL — `buildReviewDeck`/`dueCount` cap arg not honored and `GRADE_SETS` not exported.

- [ ] **Step 3: Add cap params + GRADE_SETS**

In `interview-map/src/lib/srs.ts`, replace the `buildReviewDeck` signature/body (lines 63-83) so it takes `cap`:

```ts
export function buildReviewDeck<T extends { srsKey: string; domain: string }>(
  pool: T[],
  srs: SrsState,
  today: string,
  weakDomainsOrder: string[],
  cap: number = NEW_CARD_DAILY_CAP,
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
    .slice(0, cap)

  return [...due, ...fresh]
}
```

Replace `dueCount` (lines 86-94) so it takes `cap`:

```ts
export function dueCount<T extends { srsKey: string; domain: string }>(
  pool: T[],
  srs: SrsState,
  today: string,
  cap: number = NEW_CARD_DAILY_CAP,
): number {
  const due = pool.filter((c) => srs[c.srsKey] && srs[c.srsKey].due <= today).length
  const fresh = pool.filter((c) => !srs[c.srsKey]).length
  return due + Math.min(fresh, cap)
}
```

Append the grade sets at the end of the file:

```ts
// Review-mode difficulty button presets. grade values feed review(); 0..5 with
// 0 always a lapse and 5 an easy pass. cls maps to .review-g{n} colors.
export const GRADE_SETS: Record<2 | 3 | 5, { grade: number; label: string; cls: string }[]> = {
  2: [
    { grade: 0, label: '모름', cls: 'review-g0' },
    { grade: 5, label: '알았음', cls: 'review-g5' },
  ],
  3: [
    { grade: 0, label: '모름', cls: 'review-g0' },
    { grade: 3, label: '애매', cls: 'review-g3' },
    { grade: 5, label: '쉬움', cls: 'review-g5' },
  ],
  5: [
    { grade: 0, label: '전혀', cls: 'review-g0' },
    { grade: 2, label: '어렴풋', cls: 'review-g2' },
    { grade: 3, label: '애매', cls: 'review-g3' },
    { grade: 4, label: '대략', cls: 'review-g4' },
    { grade: 5, label: '완벽', cls: 'review-g5' },
  ],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd interview-map && npx vitest run src/lib/srs.test.ts`
Expected: PASS (existing srs tests + new cap/GRADE_SETS tests). The default-arg keeps `ReviewView`'s current 4-arg call compiling until Task 6.

- [ ] **Step 5: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/lib/srs.ts interview-map/src/lib/srs.test.ts
GIT_AUTHOR_EMAIL="30681841+valorjj@users.noreply.github.com" GIT_COMMITTER_EMAIL="30681841+valorjj@users.noreply.github.com" \
  git commit -m "feat(srs): cap param on deck/dueCount + GRADE_SETS presets

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `InfoPopover` component + help strings

**Files:**
- Create: `interview-map/src/components/InfoPopover.tsx`
- Create: `interview-map/src/components/InfoPopover.css`
- Create: `interview-map/src/lib/quizHelp.ts`

**Interfaces:**
- Produces: `InfoPopover({ title, body, align }: { title: string; body: ReactNode; align?: 'left' | 'right' })`. Help strings: `MODE_HELP: ReactNode`, `ORDER_HELP: ReactNode`, `ORDER_LABELS: Record<QuizSettings['order'], string>`, `SRS_HELP: { cap: string; buttons: string }`.

- [ ] **Step 1: Create the help strings module**

Create `interview-map/src/lib/quizHelp.ts`:

```tsx
import type { ReactNode } from 'react'
import type { QuizSettings } from './quizSettings'

// Short Korean explanations shown in ℹ️ popovers. Kept as JSX so lists render.
export const ORDER_LABELS: Record<QuizSettings['order'], string> = {
  daily: '날짜 셔플',
  random: '완전 랜덤',
  sequential: '순차',
  weak: '약점·오답 우선',
}

export const MODE_HELP: ReactNode = (
  <ul>
    <li><b>플래시카드</b> — 질문을 보고 스스로 답한 뒤 정답을 확인합니다. “알았음/몰랐음”은 복습 일정에도 반영돼요.</li>
    <li><b>드릴다운</b> — 메인 질문 + 꼬리 질문을 이어서, 면접관이 파고드는 상황을 연습합니다.</li>
    <li><b>복습</b> — 간격 반복(SM-2). 복습할 때가 된 카드와 새 카드를 오늘 분량만큼 뽑아줍니다.</li>
  </ul>
)

export const ORDER_HELP: ReactNode = (
  <ul>
    <li><b>날짜 셔플</b> — 오늘 하루 고정된 랜덤 순서. 새로고침해도 같고, 자정이 지나면 새 순서가 됩니다.</li>
    <li><b>완전 랜덤</b> — 들어올 때마다 새로 섞습니다. “다시 섞기”로 즉시 다시 섞을 수 있어요. 순서 암기를 막습니다.</li>
    <li><b>순차</b> — 노트에 적힌 순서대로. 체계적으로 훑을 때 좋습니다.</li>
    <li><b>약점·오답 우선</b> — 전에 틀린 카드를 먼저, 그다음 정답률이 낮은 도메인 순으로 보여줍니다.</li>
  </ul>
)

export const SRS_HELP = {
  cap: '복습에서 하루에 새로 소개할 카드 수의 상한입니다. 복습할 때가 된(밀린) 카드는 상한과 무관하게 모두 나옵니다.',
  buttons: '복습에서 정답을 확인한 뒤 누르는 난이도 버튼 수입니다. 버튼이 많을수록 SM-2가 다음 복습 간격을 더 세밀하게 조절합니다.',
}
```

- [ ] **Step 2: Create the InfoPopover component**

Create `interview-map/src/components/InfoPopover.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { LuInfo, LuX } from 'react-icons/lu'
import './InfoPopover.css'

// Small ℹ️ toggle that opens a positioned help card. Closes on outside-click
// or Esc. Multiple instances are independent.
export function InfoPopover({ title, body, align = 'left' }: {
  title: string
  body: ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="infopop" ref={ref}>
      <button className="infopop-btn" aria-label={`${title} 설명`} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <LuInfo size={14} />
      </button>
      {open && (
        <div className="infopop-card" data-align={align} role="dialog" aria-label={title}>
          <div className="infopop-head">
            <span className="infopop-title">{title}</span>
            <button className="infopop-close" aria-label="닫기" onClick={() => setOpen(false)}>
              <LuX size={13} />
            </button>
          </div>
          <div className="infopop-body">{body}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create the styles**

Create `interview-map/src/components/InfoPopover.css`:

```css
.infopop { position: relative; display: inline-flex; }
.infopop-btn { display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border);
  background: none; color: var(--text-dim); cursor: pointer; padding: 0; }
.infopop-btn:hover { color: var(--text); background: var(--bg-elev); }
.infopop-card { position: absolute; top: 28px; z-index: 50; width: min(320px, 78vw);
  background: var(--bg-elev); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.32); padding: 10px 12px; }
.infopop-card[data-align="left"] { left: 0; }
.infopop-card[data-align="right"] { right: 0; }
.infopop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.infopop-title { font-weight: 700; font-size: 13px; color: var(--text-strong); }
.infopop-close { background: none; border: none; color: var(--text-dim); cursor: pointer;
  display: inline-flex; padding: 2px; border-radius: 5px; }
.infopop-close:hover { color: var(--text); background: var(--bg-panel); }
.infopop-body { font-size: 12.5px; line-height: 1.5; color: var(--text); }
.infopop-body ul { margin: 0; padding-left: 16px; }
.infopop-body li { margin: 4px 0; }
.infopop-body b { color: var(--text-strong); }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd interview-map && npx tsc --noEmit`
Expected: no errors. (These files are not yet imported anywhere; this only checks they typecheck. If `--noEmit` surfaces unrelated pre-existing errors, confirm none reference the new files.)

- [ ] **Step 5: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/components/InfoPopover.tsx interview-map/src/components/InfoPopover.css interview-map/src/lib/quizHelp.ts
GIT_AUTHOR_EMAIL="30681841+valorjj@users.noreply.github.com" GIT_COMMITTER_EMAIL="30681841+valorjj@users.noreply.github.com" \
  git commit -m "feat(quiz): InfoPopover component + Korean help strings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire flashcard order selector into QuizView

**Files:**
- Modify: `interview-map/src/components/QuizView.tsx`
- Modify: `interview-map/src/components/QuizView.css`

**Interfaces:**
- Consumes: `orderDeck`, `OrderCtx` (Task 2); `quizSettings`, `setQuizSettings` (Task 1); `weakDomains` (existing); `ORDER_LABELS`, `ORDER_HELP` (Task 4); `InfoPopover` (Task 4); store `srs`.

- [ ] **Step 1: Replace the deck logic + imports**

In `interview-map/src/components/QuizView.tsx`:

Update imports — replace the line 5-9 block:

```tsx
import { LuArrowRight, LuShuffle, LuTarget, LuRefreshCw } from 'react-icons/lu'
import { useGraphStore } from '../store/graphStore'
import { extractQuizItems, hashSeed, weakDomains, orderDeck } from '../lib/quiz'
import { useNotePool } from '../hooks/useNotePool'
import { domainColor } from '../styles/theme'
import { InfoPopover } from './InfoPopover'
import { ORDER_LABELS, ORDER_HELP } from '../lib/quizHelp'
import type { GraphNode } from '../graph/types'
import type { QuizSettings } from '../lib/quizSettings'
import './QuizView.css'
```

(`seededShuffle` is dropped from the import — it's now only used inside `orderDeck`; `hashSeed` is still used here to build the seed.)

Add store reads + a reshuffle nonce (after line 25 `const requestTrack = ...`):

```tsx
  const srs = useGraphStore((s) => s.srs)
  const quizSettings = useGraphStore((s) => s.quizSettings)
  const setQuizSettings = useGraphStore((s) => s.setQuizSettings)
  const [nonce, setNonce] = useState(0)
```

Replace the `deck` useMemo (lines 38-41) with:

```tsx
  const deck = useMemo(() => {
    const scoped = scope === 'all' ? pool : pool.filter((i) => i.domain === scope)
    const weakOrder = weakDomains(quizStats, { limit: 99 }).map((w) => w.domain)
    const rankOf = (d: string) => { const i = weakOrder.indexOf(d); return i === -1 ? weakOrder.length : i }
    const seed = quizSettings.order === 'random'
      ? hashSeed(`${nonce}:${scope}`)
      : hashSeed(`${todayStr()}:${scope}`)
    return orderDeck(scoped, quizSettings.order, {
      seed,
      srsLapses: (k) => srs[k]?.lapses ?? 0,
      weakRank: rankOf,
    })
  }, [pool, scope, quizSettings.order, nonce, quizStats, srs])
```

Note: `hashSeed` is still used to build the seed passed to `orderDeck`; `seededShuffle` is no longer referenced in this file (dropped from imports in Step 1).

- [ ] **Step 2: Add the order selector UI**

In `interview-map/src/components/QuizView.tsx`, insert an order-selector row directly BEFORE the `<div className="quiz-scopes">` block (line 58). Add this inside the top-level `<div className="quiz">`:

```tsx
      <div className="quiz-order">
        <span className="quiz-order-label">순서</span>
        <div className="quiz-order-seg">
          {(Object.keys(ORDER_LABELS) as QuizSettings['order'][]).map((o) => (
            <button key={o} className="quiz-order-opt" data-active={quizSettings.order === o}
              onClick={() => setQuizSettings({ order: o })}>
              {ORDER_LABELS[o]}
            </button>
          ))}
        </div>
        {quizSettings.order === 'random' && (
          <button className="quiz-reshuffle" onClick={() => setNonce((n) => n + 1)}>
            <LuRefreshCw size={13} /> 다시 섞기
          </button>
        )}
        <InfoPopover title="카드 순서" body={ORDER_HELP} />
      </div>
```

- [ ] **Step 3: Add the styles**

Append to `interview-map/src/components/QuizView.css`:

```css
.quiz-order { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.quiz-order-label { font-size: 12px; color: var(--text-dim); font-weight: 600; }
.quiz-order-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.quiz-order-opt { background: none; border: none; color: var(--text-dim); cursor: pointer;
  padding: 5px 10px; font-size: 12px; border-right: 1px solid var(--border); }
.quiz-order-opt:last-child { border-right: none; }
.quiz-order-opt:hover { background: var(--bg-elev); color: var(--text); }
.quiz-order-opt[data-active="true"] { background: var(--accent); color: #fff; }
.quiz-reshuffle { display: inline-flex; align-items: center; gap: 4px; background: none;
  border: 1px solid var(--border); border-radius: 8px; color: var(--text-dim);
  cursor: pointer; padding: 5px 9px; font-size: 12px; }
.quiz-reshuffle:hover { background: var(--bg-elev); color: var(--text); }
```

- [ ] **Step 4: Verify it compiles and tests pass**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run`
Expected: no type errors; 102+ tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/components/QuizView.tsx interview-map/src/components/QuizView.css
GIT_AUTHOR_EMAIL="30681841+valorjj@users.noreply.github.com" GIT_COMMITTER_EMAIL="30681841+valorjj@users.noreply.github.com" \
  git commit -m "feat(quiz): flashcard order selector + reshuffle + ℹ️

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Variable grade buttons + cap in ReviewView

**Files:**
- Modify: `interview-map/src/components/ReviewView.tsx`
- Modify: `interview-map/src/components/ReviewView.css:33-35`

**Interfaces:**
- Consumes: `GRADE_SETS` (Task 3), `buildReviewDeck` with cap (Task 3), `quizSettings` (Task 1).

- [ ] **Step 1: Use GRADE_SETS + cap**

In `interview-map/src/components/ReviewView.tsx`:

Update the srs import (line 8):

```tsx
import { buildReviewDeck, GRADE_SETS } from '../lib/srs'
```

Delete the local `GRADES` const (lines 20-24).

Add a `quizSettings` read (after line 32 `const recordReview = ...`):

```tsx
  const quizSettings = useGraphStore((s) => s.quizSettings)
```

Replace the `deck` useMemo body (lines 40-44) to pass the cap and select the grade set:

```tsx
  const cap = quizSettings.newCardCap === 0 ? Infinity : quizSettings.newCardCap
  const deck = useMemo(() => {
    const weakOrder = weakDomains(quizStats, { limit: 99 }).map((w) => w.domain)
    return buildReviewDeck(pool, srs, today, weakOrder, cap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool])
  const grades = GRADE_SETS[quizSettings.gradeButtons] ?? GRADE_SETS[3]
```

Replace the grade-buttons render (lines 101-109 `{revealed && (...)}`) to map `grades`:

```tsx
          {revealed && (
            <div className="review-grades">
              {grades.map((g) => (
                <button key={g.grade} className={`review-grade ${g.cls}`} onClick={() => grade(g.grade)}>
                  {g.label}
                </button>
              ))}
            </div>
          )}
```

- [ ] **Step 2: Add the two new grade colors**

In `interview-map/src/components/ReviewView.css`, after line 35 (`.review-g5 ...`):

```css
.review-g2 { border-color: #e5844d; color: #e5844d; }
.review-g4 { border-color: #6cae30; color: #6cae30; }
```

- [ ] **Step 3: Verify it compiles and tests pass**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/components/ReviewView.tsx interview-map/src/components/ReviewView.css
GIT_AUTHOR_EMAIL="30681841+valorjj@users.noreply.github.com" GIT_COMMITTER_EMAIL="30681841+valorjj@users.noreply.github.com" \
  git commit -m "feat(review): grade buttons from GRADE_SETS + honor new-card cap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: QuizTab settings ⚙️ popover, mode ℹ️, cap in badge

**Files:**
- Modify: `interview-map/src/components/QuizTab.tsx`
- Modify: `interview-map/src/components/QuizTab.css`

**Interfaces:**
- Consumes: `dueCount` with cap (Task 3), `quizSettings`/`setQuizSettings` (Task 1), `InfoPopover` (Task 4), `MODE_HELP`/`SRS_HELP` (Task 4), store `setSrs`/`setQuizStats`.

- [ ] **Step 1: Rewrite QuizTab with settings + mode help**

Replace the whole file `interview-map/src/components/QuizTab.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { LuMic, LuRepeat, LuSettings, LuTrash2 } from 'react-icons/lu'
import { QuizView } from './QuizView'
import { DrillView } from './DrillView'
import { ReviewView } from './ReviewView'
import { InfoPopover } from './InfoPopover'
import { useGraphStore } from '../store/graphStore'
import { useNotePool } from '../hooks/useNotePool'
import { extractQuizItems } from '../lib/quiz'
import { dueCount } from '../lib/srs'
import { MODE_HELP, SRS_HELP } from '../lib/quizHelp'
import type { GraphNode } from '../graph/types'
import './QuizTab.css'

type QuizMode = 'flash' | 'drill' | 'review'

const CAP_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 20, label: '20' },
  { value: 30, label: '30' }, { value: 0, label: '무제한' },
]
const BUTTON_OPTIONS: (2 | 3 | 5)[] = [2, 3, 5]

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Quiz tab shell: flashcard practice, interview drill-down, and SRS review,
// plus a settings gear (new-card cap, grade buttons, data reset) and mode help.
export function QuizTab({ nodes }: { nodes: GraphNode[] }) {
  const [mode, setMode] = useState<QuizMode>('flash')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const srs = useGraphStore((s) => s.srs)
  const quizSettings = useGraphStore((s) => s.quizSettings)
  const setQuizSettings = useGraphStore((s) => s.setQuizSettings)
  const setSrs = useGraphStore((s) => s.setSrs)
  const setQuizStats = useGraphStore((s) => s.setQuizStats)
  const { buildItems } = useNotePool(nodes)
  const pool = useMemo(() => buildItems(extractQuizItems), [buildItems])
  const cap = quizSettings.newCardCap === 0 ? Infinity : quizSettings.newCardCap
  const due = useMemo(() => dueCount(pool, srs, todayStr(), cap), [pool, srs, cap])

  const resetData = () => {
    if (!window.confirm('퀴즈/복습 기록(정답률·복습 일정)을 모두 초기화할까요? 학습 경로 진도는 유지됩니다.')) return
    setSrs({})
    setQuizStats({})
  }

  return (
    <div className="quiztab">
      <div className="quiztab-bar">
        <div className="quiztab-modes" role="tablist" aria-label="퀴즈 모드">
          <button className="quiztab-mode" role="tab" aria-selected={mode === 'flash'}
            data-active={mode === 'flash'} onClick={() => setMode('flash')}>
            플래시카드
          </button>
          <button className="quiztab-mode" role="tab" aria-selected={mode === 'drill'}
            data-active={mode === 'drill'} onClick={() => setMode('drill')}>
            <LuMic size={14} /> 드릴다운
          </button>
          <button className="quiztab-mode" role="tab" aria-selected={mode === 'review'}
            data-active={mode === 'review'} onClick={() => setMode('review')}>
            <LuRepeat size={14} /> 복습{due > 0 && <span className="quiztab-badge">{due}</span>}
          </button>
        </div>
        <div className="quiztab-tools">
          <InfoPopover title="퀴즈 모드 설명" body={MODE_HELP} align="right" />
          <div className="quiztab-settings">
            <button className="quiztab-gear" aria-label="퀴즈 설정" aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}>
              <LuSettings size={16} />
            </button>
            {settingsOpen && (
              <div className="quiztab-panel" role="dialog" aria-label="퀴즈 설정">
                <div className="quiztab-set">
                  <div className="quiztab-set-head">
                    <span>하루 새 카드 상한</span>
                    <InfoPopover title="새 카드 상한" body={SRS_HELP.cap} align="right" />
                  </div>
                  <div className="quiztab-seg">
                    {CAP_OPTIONS.map((o) => (
                      <button key={o.value} data-active={quizSettings.newCardCap === o.value}
                        onClick={() => setQuizSettings({ newCardCap: o.value })}>{o.label}</button>
                    ))}
                  </div>
                </div>
                <div className="quiztab-set">
                  <div className="quiztab-set-head">
                    <span>난이도 버튼 수 (복습)</span>
                    <InfoPopover title="난이도 버튼 수" body={SRS_HELP.buttons} align="right" />
                  </div>
                  <div className="quiztab-seg">
                    {BUTTON_OPTIONS.map((n) => (
                      <button key={n} data-active={quizSettings.gradeButtons === n}
                        onClick={() => setQuizSettings({ gradeButtons: n })}>{n}개</button>
                    ))}
                  </div>
                </div>
                <button className="quiztab-reset" onClick={resetData}>
                  <LuTrash2 size={14} /> 퀴즈/복습 기록 초기화
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {mode === 'flash' && <QuizView nodes={nodes} />}
      {mode === 'drill' && <DrillView nodes={nodes} />}
      {mode === 'review' && <ReviewView nodes={nodes} />}
    </div>
  )
}
```

- [ ] **Step 2: Add the styles**

Append to `interview-map/src/components/QuizTab.css`:

```css
.quiztab-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px;
  flex-wrap: wrap; margin-bottom: 12px; }
.quiztab-tools { display: flex; align-items: center; gap: 6px; }
.quiztab-settings { position: relative; display: inline-flex; }
.quiztab-gear { display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
  background: none; color: var(--text-dim); cursor: pointer; }
.quiztab-gear:hover { color: var(--text); background: var(--bg-elev); }
.quiztab-panel { position: absolute; top: 36px; right: 0; z-index: 60; width: min(300px, 82vw);
  background: var(--bg-elev); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.32); padding: 12px; display: flex; flex-direction: column; gap: 14px; }
.quiztab-set { display: flex; flex-direction: column; gap: 6px; }
.quiztab-set-head { display: flex; align-items: center; justify-content: space-between;
  font-size: 12.5px; font-weight: 600; color: var(--text-strong); }
.quiztab-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.quiztab-seg button { flex: 1; background: none; border: none; border-right: 1px solid var(--border);
  color: var(--text-dim); cursor: pointer; padding: 6px 4px; font-size: 12px; }
.quiztab-seg button:last-child { border-right: none; }
.quiztab-seg button:hover { background: var(--bg-panel); color: var(--text); }
.quiztab-seg button[data-active="true"] { background: var(--accent); color: #fff; }
.quiztab-reset { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: none; border: 1px solid #e5484d; border-radius: 8px; color: #e5484d;
  cursor: pointer; padding: 7px 10px; font-size: 12.5px; }
.quiztab-reset:hover { background: color-mix(in srgb, #e5484d 12%, transparent); }
```

Note: the settings panel closes only via the gear toggle (click it again). Outside-click auto-close is intentionally left to the InfoPopover instances; the panel itself stays open while the user adjusts multiple settings.

- [ ] **Step 3: Verify it compiles and tests pass**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/jeongjin/Documents/cs-study
git add interview-map/src/components/QuizTab.tsx interview-map/src/components/QuizTab.css
GIT_AUTHOR_EMAIL="30681841+valorjj@users.noreply.github.com" GIT_COMMITTER_EMAIL="30681841+valorjj@users.noreply.github.com" \
  git commit -m "feat(quiz): settings gear (cap, grade buttons, reset) + mode ℹ️

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verification + merge

**Files:** none (build/verify only)

- [ ] **Step 1: Full test + typecheck + build**

Run: `cd interview-map && npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors; all tests pass; build succeeds (writes `dist/`).

- [ ] **Step 2: Playwright smoke test**

Start preview in the background: `cd interview-map && npm run preview` (note the port, usually 4173).

Then run a Playwright script (Node, using the cached playwright at `/Users/jeongjin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js`) that:
1. Opens the app, navigates to the 퀴즈 tab (click the bottom-nav 퀴즈 button).
2. Asserts the order selector shows 4 options (날짜 셔플 / 완전 랜덤 / 순차 / 약점·오답 우선).
3. Clicks 완전 랜덤 → asserts a "다시 섞기" button appears; clicks it (no console error).
4. Clicks the mode-row ℹ️ → asserts a dialog with "플래시카드"/"드릴다운"/"복습" text; presses Escape → closes.
5. Clicks the ⚙️ gear → asserts the panel shows 상한 options (10/15/20/30/무제한) and 버튼 수 (2개/3개/5개).
6. Switches to 복습 mode → sets 버튼 수 to 5 in the gear → asserts 5 grade buttons render after revealing an answer (전혀/어렴풋/애매/대략/완벽). (If no card is due, first do a couple of flashcard 알았음/몰랐음 to seed, or accept the empty-state and assert the gear options instead.)
7. Collects `console` messages; asserts zero errors.

Expected: all assertions pass, 0 console errors. If any fail, fix the offending task's code and re-run from Step 1.

- [ ] **Step 3: Manual behavior sanity (via the same Playwright session or notes)**

Confirm: switching order to 순차 shows card 1/N in note order; 날짜 셔플 keeps order across reload; changing 상한 to 무제한 changes the 복습 badge count if >cap new cards exist; 초기화 confirm dialog wording is correct and cancelling it leaves data intact.

- [ ] **Step 4: Merge to main and clean up**

```bash
cd /Users/jeongjin/Documents/cs-study
git checkout main
git merge --ff-only <feature-branch>
git branch -d <feature-branch>
git push
```

(If not already on a feature branch, the tasks were committed to `main` directly — in that case just `git push`. Prefer creating `feat/quiz-settings` before Task 1.)

---

## Notes for the implementer

- Create the branch first: `git checkout -b feat/quiz-settings` before Task 1.
- `todayStr()` is duplicated across QuizView/QuizTab/ReviewView already; do not refactor it in this plan (out of scope, keep diff minimal).
- The flashcard O/X buttons in QuizView are unchanged — only Review mode uses `GRADE_SETS`.
- Settings are local-only by design; do NOT touch `useCloudSync.ts`.
- Korean copy must match the spec exactly for the reset confirm dialog.
