# Quiz Self-Assessment → Weak-Domain Recommendation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** After revealing a quiz answer, the user self-assesses (몰랐음/알았음); per-domain accuracy is tracked and the weakest domains surface as "약점 보강" chips that open that domain's study-path course.

**Architecture:** A pure `weakDomains()` in `quiz.ts`; `quizStats` + `recordQuizResult` + a cross-view `pathTrackId`/`requestTrack`/`clearPathTrack` in the store (quizStats hydrated synchronously like `studiedIds`); QuizView gains assessment buttons + weak chips; PathView consumes the track request.

**Tech Stack:** Vite + React, zustand, Vitest.

## Global Constraints
- Korean UI copy + English code.
- `quizStats` persisted at `localStorage["interview-map.quizstats.v1"]`, hydrated in the store (no StrictMode hydrate race). Separate from `studiedIds`.
- Weak = `seen >= 3` and accuracy `< 0.8`, weakest first, max 3 (ties → higher `seen`).
- Everything works logged-out/guest; no cloud coupling this plan (quiz_stats cloud sync is a later follow-up).
- Public repo commit rules: email `30681841+valorjj@users.noreply.github.com`, Co-Authored-By.

---

### Task 1: `weakDomains` pure function

**Files:**
- Modify: `interview-map/src/lib/quiz.ts`
- Test: `interview-map/src/lib/quiz.test.ts`

**Interfaces:**
- Produces: `interface WeakDomain { domain: string; correct: number; seen: number; rate: number }` and `weakDomains(stats: Record<string, { correct: number; seen: number }>, opts?: { minSeen?: number; maxRate?: number; limit?: number }): WeakDomain[]`.

- [ ] **Step 1: Write failing tests** — append to `quiz.test.ts`:

```ts
import { weakDomains } from './quiz'

describe('weakDomains', () => {
  const stats = {
    os: { correct: 2, seen: 5 },       // 0.40  weak
    network: { correct: 3, seen: 5 },  // 0.60  weak
    java: { correct: 5, seen: 5 },     // 1.00  not weak
    db: { correct: 1, seen: 2 },       // 0.50  but seen<3 → excluded
    react: { correct: 4, seen: 5 },    // 0.80  not < 0.8 → excluded
  }
  it('returns domains with seen>=minSeen and rate<maxRate, weakest first', () => {
    expect(weakDomains(stats).map((w) => w.domain)).toEqual(['os', 'network'])
  })
  it('respects the limit', () => {
    expect(weakDomains(stats, { limit: 1 }).map((w) => w.domain)).toEqual(['os'])
  })
  it('computes rate and is empty when nothing qualifies', () => {
    expect(weakDomains({ x: { correct: 3, seen: 3 } })).toEqual([])
    expect(weakDomains({ y: { correct: 0, seen: 4 } })[0].rate).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect fail.** `cd interview-map && npx vitest run src/lib/quiz.test.ts` → FAIL (`weakDomains` missing).

- [ ] **Step 3: Implement** — append to `quiz.ts`:

```ts
export interface WeakDomain {
  domain: string
  correct: number
  seen: number
  rate: number
}

// Domains answered >= minSeen times with accuracy below maxRate, weakest (lowest
// rate) first, capped at limit. Ties broken by more attempts (seen) first.
export function weakDomains(
  stats: Record<string, { correct: number; seen: number }>,
  opts?: { minSeen?: number; maxRate?: number; limit?: number },
): WeakDomain[] {
  const { minSeen = 3, maxRate = 0.8, limit = 3 } = opts ?? {}
  return Object.entries(stats)
    .map(([domain, s]) => ({ domain, correct: s.correct, seen: s.seen, rate: s.seen ? s.correct / s.seen : 0 }))
    .filter((w) => w.seen >= minSeen && w.rate < maxRate)
    .sort((a, b) => a.rate - b.rate || b.seen - a.seen)
    .slice(0, limit)
}
```

- [ ] **Step 4: Run — expect pass.** `cd interview-map && npx vitest run src/lib/quiz.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/lib/quiz.ts interview-map/src/lib/quiz.test.ts
git commit -m "feat: weakDomains — rank weakest quiz domains by accuracy"
```

---

### Task 2: Store quiz stats + track-request + persistence

**Files:**
- Modify: `interview-map/src/store/graphStore.ts`
- Modify: `interview-map/src/hooks/useTheme.ts`
- Modify: `interview-map/src/App.tsx`

**Interfaces:**
- Produces: store `quizStats: Record<string, QuizStat>`, `recordQuizResult(domain, correct)`, `pathTrackId: string | null`, `requestTrack(trackId)`, `clearPathTrack()`; `export interface QuizStat`; `export const QUIZSTATS_KEY`; hook `useQuizStatsEffect()`.

- [ ] **Step 1: Extend `graphStore.ts`** — add key + loader near `PROGRESS_KEY`/`loadStudied`:

```ts
export interface QuizStat { correct: number; seen: number }
export const QUIZSTATS_KEY = 'interview-map.quizstats.v1'
function loadQuizStats(): Record<string, QuizStat> {
  try {
    const s = localStorage.getItem(QUIZSTATS_KEY)
    return s ? (JSON.parse(s) as Record<string, QuizStat>) : {}
  } catch {
    return {}
  }
}
```

Add to the `GraphState` interface (after the studied fields):
```ts
  quizStats: Record<string, QuizStat>
  recordQuizResult: (domain: string, correct: boolean) => void
  pathTrackId: string | null               // 퀴즈 약점 칩 → 경로 코스 열기 요청
  requestTrack: (trackId: string) => void
  clearPathTrack: () => void
```

Add to the store body (after `setStudiedIds`):
```ts
  quizStats: loadQuizStats(),
  recordQuizResult: (domain, correct) => set((s) => {
    const cur = s.quizStats[domain] ?? { correct: 0, seen: 0 }
    return { quizStats: { ...s.quizStats, [domain]: { correct: cur.correct + (correct ? 1 : 0), seen: cur.seen + 1 } } }
  }),
  pathTrackId: null,
  requestTrack: (trackId) => set({ pathTrackId: trackId, viewMode: 'path' }),
  clearPathTrack: () => set({ pathTrackId: null }),
```

- [ ] **Step 2: Add `useQuizStatsEffect`** in `useTheme.ts` — import the key and append the hook:

Change the store import line:
```ts
import { useGraphStore, PROGRESS_KEY, QUIZSTATS_KEY } from '../store/graphStore'
```
Append at end of file:
```ts
// Persist quiz stats (hydrated synchronously in the store; this only writes).
export function useQuizStatsEffect(): void {
  const quizStats = useGraphStore((s) => s.quizStats)
  useEffect(() => {
    try { localStorage.setItem(QUIZSTATS_KEY, JSON.stringify(quizStats)) } catch { /* ignore */ }
  }, [quizStats])
}
```

- [ ] **Step 3: Wire in `App.tsx`** — import and call:

Update the hooks import:
```tsx
import { useThemeEffect, useViewModeEffect, useProgressEffect, useQuizStatsEffect } from './hooks/useTheme'
```
Call it with the others:
```tsx
  useQuizStatsEffect()
```

- [ ] **Step 4: Typecheck** — `cd interview-map && npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add interview-map/src/store/graphStore.ts interview-map/src/hooks/useTheme.ts interview-map/src/App.tsx
git commit -m "feat: store quizStats + recordQuizResult + track-request (persisted)"
```

---

### Task 3: QuizView self-assessment + weak-domain chips

**Files:**
- Modify: `interview-map/src/components/QuizView.tsx`
- Modify: `interview-map/src/components/QuizView.css`

**Interfaces:**
- Consumes: `recordQuizResult`, `quizStats`, `requestTrack` (store); `weakDomains` (`../lib/quiz`).

- [ ] **Step 1: Imports + store reads** — in `QuizView.tsx`:

Update the quiz import to add `weakDomains`:
```tsx
import { extractQuizItems, seededShuffle, hashSeed, weakDomains } from '../lib/quiz'
```
Add store reads (next to the existing `select`/`setViewMode`):
```tsx
  const recordQuizResult = useGraphStore((s) => s.recordQuizResult)
  const quizStats = useGraphStore((s) => s.quizStats)
  const requestTrack = useGraphStore((s) => s.requestTrack)
```

- [ ] **Step 2: Derived helpers** — add after `const card = deck[index]` (near the end, before `return`):

```tsx
  const domainLabel = new Map(nodes.filter((n) => n.level === 0).map((n) => [n.domain, n.label]))
  const weak = weakDomains(quizStats)
  const advance = () => { setIndex((i) => (i + 1) % deck.length); setRevealed(false) }
  const assess = (correct: boolean) => { if (card) recordQuizResult(card.domain, correct); advance() }
```

- [ ] **Step 3: Weak-domain strip** — insert right after the `.quiz-scopes` closing `</div>` (before `{card ? (`):

```tsx
      {weak.length > 0 && (
        <div className="quiz-weak">
          <span className="quiz-weak-label">🎯 약점 보강</span>
          {weak.map((w) => (
            <button key={w.domain} className="quiz-weak-chip" onClick={() => requestTrack(`domain:${w.domain}`)}>
              {domainLabel.get(w.domain) ?? w.domain} <b>{w.correct}/{w.seen}</b>
            </button>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Assessment actions** — replace the existing `<div className="quiz-actions">…</div>` block (QuizView.tsx lines ~132-139) with:

```tsx
          <div className="quiz-actions">
            <button className="quiz-link" onClick={() => { select(card.nodeId); setViewMode('list') }}>
              이 개념 보기 <LuArrowRight size={14} />
            </button>
            {revealed ? (
              <div className="quiz-assess">
                <button className="quiz-miss" onClick={() => assess(false)}>몰랐음</button>
                <button className="quiz-got" onClick={() => assess(true)}>알았음</button>
              </div>
            ) : (
              <button className="quiz-next" onClick={advance}>다음 <LuArrowRight size={14} /></button>
            )}
          </div>
```

- [ ] **Step 5: CSS** — append to `QuizView.css`:

```css
.quiz-weak { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 680px; }
.quiz-weak-label { font-size: 12px; color: var(--text-dim); font-weight: 700; }
.quiz-weak-chip { border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  color: var(--text-strong); border-radius: 999px; padding: 4px 11px; cursor: pointer; font-size: 12px; }
.quiz-weak-chip:hover { background: color-mix(in srgb, var(--accent) 22%, var(--bg)); }
.quiz-weak-chip b { font-variant-numeric: tabular-nums; }

.quiz-assess { display: flex; gap: 8px; }
.quiz-miss, .quiz-got { border-radius: 10px; padding: 9px 16px; cursor: pointer; font-size: 13px; font-weight: 700; border: 1px solid transparent; }
.quiz-miss { background: none; border-color: var(--border-strong); color: var(--text-dim); }
.quiz-miss:hover { color: var(--text-strong); border-color: var(--text-dim); }
.quiz-got { background: var(--accent); color: var(--node-studied-text); }
.quiz-got:hover { filter: brightness(1.08); }
```

- [ ] **Step 6: Typecheck + full tests** — `cd interview-map && npx tsc --noEmit && npx vitest run` → no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add interview-map/src/components/QuizView.tsx interview-map/src/components/QuizView.css
git commit -m "feat: quiz self-assessment (몰랐음/알았음) + weak-domain 약점 보강 chips"
```

---

### Task 4: PathView consumes track request

**Files:**
- Modify: `interview-map/src/components/PathView.tsx`

**Interfaces:**
- Consumes: store `pathTrackId`, `clearPathTrack`.

- [ ] **Step 1: Import `useEffect`** — update the React import:

```tsx
import { useEffect, useMemo, useState } from 'react'
```

- [ ] **Step 2: Read the request + consume it** — add store reads with the others:

```tsx
  const pathTrackId = useGraphStore((s) => s.pathTrackId)
  const clearPathTrack = useGraphStore((s) => s.clearPathTrack)
```
And add an effect after `const [mobileDetail, setMobileDetail] = useState(false)`:

```tsx
  // A quiz weak-domain chip (requestTrack) asked to open a specific course.
  useEffect(() => {
    if (!pathTrackId) return
    setSelectedId(pathTrackId)
    setMobileDetail(true)
    clearPathTrack()
  }, [pathTrackId, clearPathTrack])
```

- [ ] **Step 3: Typecheck** — `cd interview-map && npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add interview-map/src/components/PathView.tsx
git commit -m "feat: PathView opens the course requested by a quiz weak-domain chip"
```

---

## Final verification (verify skill — real browser)

- `npm run dev`, Playwright:
  1. 퀴즈 탭 → 답 보기 → actions become `몰랐음`/`알았음`; click either → next card advances.
  2. Answer several cards in one domain with a mix → "🎯 약점 보강" strip shows that domain `correct/seen`.
  3. Click a weak chip → switches to 경로 view with that domain's course selected.
  4. Reload → quizStats persist (chip still shown); a domain answered all-correct (≥3) is not listed.
- Screenshot each. Then `superpowers:finishing-a-development-branch`.
