# Quiz Self-Assessment → Weak-Domain Recommendation — Design Spec

**Date:** 2026-07-18
**Status:** Approved (pending user review)

## Goal

Close the quiz→study loop: let the user self-assess each quiz card
(knew it / didn't), track accuracy per domain, surface the weakest domains, and
link straight to that domain's study-path course.

## Decisions (from brainstorming)

1. **Self-assessment**, not scoring: after the answer is revealed, the card's
   actions become `[몰랐음] [알았음]`; either records a result for the card's
   domain and advances to the next card.
2. **Per-domain stats** (`correct`/`seen`), persisted; hydrated synchronously in
   the store (same pattern as `studiedIds`, avoids the StrictMode hydrate race).
3. **Weak domains** = `seen >= 3` and accuracy `< 0.8`, weakest first (max 3).
4. **Recommendation** shown in QuizView as "약점 보강" chips → clicking opens the
   path view on that domain's course.
5. Quiz stats are **separate** from `studiedIds` (recall ≠ course completion).
   Course→quiz generation is out of scope this round.

## Data

### Store — `src/store/graphStore.ts`
```ts
export interface QuizStat { correct: number; seen: number }

// new state
quizStats: Record<string, QuizStat>          // keyed by domain id
recordQuizResult: (domain: string, correct: boolean) => void
// cross-view: request the path view to open a specific course
pathTrackId: string | null
requestTrack: (trackId: string) => void      // sets pathTrackId + viewMode 'path'
clearPathTrack: () => void
```

`quizStats` is loaded synchronously at store creation (`loadQuizStats()` reading
`localStorage["interview-map.quizstats.v1"]`, mirroring `loadStudied`).
`recordQuizResult` increments `seen` (and `correct` when true) for the domain.

### Persistence — `src/hooks/useTheme.ts`
- `useProgressEffect` also persists `quizStats` (or a sibling `useQuizStatsEffect`);
  write-only, since state is hydrated in the store.

## Pure function — `src/lib/quiz.ts`

```ts
export interface WeakDomain { domain: string; correct: number; seen: number; rate: number }

// Domains answered at least `minSeen` times with accuracy below `maxRate`,
// weakest (lowest rate) first, capped at `limit`.
export function weakDomains(
  stats: Record<string, { correct: number; seen: number }>,
  opts?: { minSeen?: number; maxRate?: number; limit?: number },
): WeakDomain[]
```

Defaults: `minSeen = 3`, `maxRate = 0.8`, `limit = 3`. Ties broken by `seen` desc.

## Components

### `src/components/QuizView.tsx`
- Reads `recordQuizResult`, `quizStats`, `requestTrack` from the store; builds a
  `domainLabel` map (level-0 nodes) as PathView does.
- **Actions after reveal**: replace the single "다음" with
  `[몰랐음] [알았음]`; each calls `recordQuizResult(card.domain, correct)` then
  advances (`index = (index+1) % len`, `revealed = false`). Keep "이 개념 보기".
  Before reveal: unchanged (`답 보기`, `이 개념 보기`, `다음` skip).
- **Weak-domain strip**: compute `weakDomains(quizStats)`; when non-empty, render
  a "🎯 약점 보강" row of chips `<label> <correct>/<seen>`; clicking a chip calls
  `requestTrack(\`domain:${weak.domain}\`)`.

### `src/components/PathView.tsx`
- Consume the cross-view request: on mount / when `pathTrackId` changes and is
  non-null, `setSelectedId(pathTrackId)`, `setMobileDetail(true)`, then
  `clearPathTrack()` so later manual selection isn't overridden.

## Component boundaries

- `weakDomains` is pure (stats → ranked list), unit-tested.
- `recordQuizResult`/persistence live in the store + hook (same pattern as
  progress), isolated from view logic.
- QuizView owns assessment UI + recommendation; PathView owns course selection.
  The only coupling is three store fields (`pathTrackId`/`requestTrack`/`clearPathTrack`).

## Testing

- **Unit** (`quiz.test.ts`):
  - `weakDomains`: filters by `minSeen`, filters by `maxRate`, sorts weakest
    first, caps at `limit`, breaks ties by `seen`; empty when nothing qualifies.
- **Runtime (verify skill, browser):**
  - Answer several cards in one domain with mixed 알았음/몰랐음 → "약점 보강" chip
    appears with the right `correct/seen`.
  - Click the chip → path view opens that domain's course selected.
  - Reload → stats persist (chip still shown).
  - A domain answered all-correct (≥3) → not listed as weak.

## Out of scope

- Marking quiz-correct concepts as `studied` (kept separate).
- Course→quiz generation (quiz scoped to a course's node set).
- Per-concept (vs per-domain) stats; decay/streaks; stat reset UI.
