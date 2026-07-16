# Random Daily Quiz — Design Spec

**Date:** 2026-07-16
**Status:** Approved (pending user review of this doc)

## Problem / Goal

Add a flashcard-style **quiz view** for interview recall practice. The user
picks a scope — a specific domain or the whole graph (pure random) — and works
through questions one card at a time: read question → reveal a short answer →
optionally jump to that concept's note page → next.

## Decisions (from brainstorming)

1. **Data source = inline 예상 면접 질문** (336 across notes), because each lives
   inside a concept section and so maps to a specific node → precise "specific
   page" links + short prose answers. (Domain `<details>` Quiz blobs are
   domain-level with long/tabular answers — not used here.)
2. **Placement = 3rd view tab** "퀴즈" alongside 지도/목록 (extend `ViewMode`).
3. **"Daily" = date-seeded deterministic shuffle** per scope. Today's order is
   stable (same first card all day); "다음" walks that order, wrapping around.
4. **Flashcard flow**: question → "답 보기" reveals short answer → "이 개념 보기 →"
   selects the source node and switches to list view → "다음 →" advances.

## Data model

```ts
interface QuizItem {
  id: string          // stable: `${nodeId}#${qIndex}`
  question: string    // text of the **Q...** paragraph (Q-prefix stripped)
  answer: string      // markdown of the first following blockquote (short)
  domain: string      // domain id, for scope filter + badge
  nodeId: string      // concept node to link to (fallback: domain node)
  nodeLabel: string   // concept label for the link button
}
```

### How items are built (runtime)

1. From `graph.json`, build a per-file anchor map: for each node with a
   `noteRef` `path#anchor`, record `fileMap[path][anchor] = { nodeId, label,
   domain }`. Also record each domain id's own node (`domainNode[domain]`).
2. Fetch each unique note file once (`Promise.all`), `parseSections`.
3. For each section, resolve `owner = fileMap[path][section.slug]`. Run
   `extractQuizItems(section.body)`; for each Q, emit a `QuizItem` with
   `nodeId = owner?.nodeId ?? domainNode[domain]`.
4. Concatenate across files → the full item pool.

Runtime parsing (not a build-time JSON) keeps the quiz in sync as note content
changes — the notes are edited frequently.

## Pure functions — `src/lib/quiz.ts`

```ts
export interface RawQuizItem { question: string; answer: string }

// Parse inline interview Q&A from a section body: a **Q...** (bold) line
// followed by a `>` blockquote answer. Mirrors rehypeFoldQA's pairing rule but
// at the markdown level. Fence-aware. The first blockquote after the Q is the
// answer (a trailing "🔎 꼬리 질문" blockquote is NOT included — keeps it short).
export function extractQuizItems(body: string): RawQuizItem[]

// Deterministic seeded shuffle (mulberry32 PRNG + Fisher-Yates). Same seed →
// same order, so "today's" order is stable and testable.
export function seededShuffle<T>(items: T[], seed: number): T[]

// Hash a string (e.g. "2026-07-16:network") to a 32-bit seed for seededShuffle.
export function hashSeed(s: string): number
```

`extractQuizItems` details:
- Question line matches `/^\*\*\s*Q\d*\s*[.:]/` (bold Q with number, `.`/`:`).
- Strip surrounding `**`, and a leading quote wrapper if present, for display.
- Answer = the immediately-following blockquote block (consecutive `>` lines,
  `>` stripped and joined). Skip blank lines between Q and blockquote.
- Ignore `**Q...` lines inside code fences.

## Components

### `src/store/graphStore.ts`
- `ViewMode = 'graph' | 'list' | 'quiz'`. No other store state needed (quiz
  card state is local to `QuizView`).

### `src/hooks/useTheme.ts`
- `useViewModeEffect` hydrate guard accepts `'quiz'` too.

### `src/components/ViewToggle.tsx`
- Add a third tab "퀴즈" (icon e.g. `LuBrain`), same pattern as existing tabs.

### `src/components/QuizView.tsx` (new)
- On mount, build the item pool (fetch + parse, memoized). Loading + empty
  states.
- Scope state: `'all' | <domainId>`; a chip row to pick (전체 랜덤 + one per
  domain present in the pool).
- Derived `deck = seededShuffle(pool.filter(byScope), hashSeed(todayStr + ':' +
  scope))`. `todayStr` = local `YYYY-MM-DD`.
- Card state: `index` (0), `revealed` (false). Scope change resets both.
- Render: progress `index+1 / deck.length`, domain badge, question; "답 보기"
  toggles `revealed` (answer rendered via the same Markdown pipeline as notes);
  "이 개념 보기 →" → `select(item.nodeId); setViewMode('list')`; "다음 →" →
  `index=(index+1)%len; revealed=false`.

### `src/App.tsx`
- `viewMode === 'quiz'` → render `<QuizView nodes edges />` (needs graph data to
  build the pool and to resolve labels).

### `src/components/QuizView.css` (new)
- Card layout, scope chips, reveal animation, buttons — reuse theme vars and
  existing chip/button styling conventions from NotePanel/controls.

## Component boundaries

- `quiz.ts` is pure (string in → data out), unit-tested, no React/DOM/fetch.
- `QuizView` owns fetching, scope/card state, and rendering; consumes `quiz.ts`,
  `parseSections`, and the store.
- Store/ViewToggle/App changes are the minimal wiring for a 3rd view.

## Testing

- **Unit** (`quiz.test.ts`):
  - `extractQuizItems`: pairs `**Q.**` + blockquote; strips Q markers; excludes a
    trailing 꼬리질문 blockquote; ignores fenced `**Q`; returns `[]` when none.
  - `seededShuffle`: same seed → identical order; different seed → (very likely)
    different order; is a permutation (same multiset); does not mutate input.
  - `hashSeed`: deterministic; different strings → different seeds (spot-check).
- **Runtime (verify skill, real browser):**
  - Open 퀴즈 tab → a card renders with a question; "답 보기" reveals the answer.
  - Pick a domain scope → progress count changes, questions are from that domain.
  - "이 개념 보기 →" → lands on the concept's note page (list view, correct node).
  - "다음 →" advances; reload same day → same first card (deterministic).

## Out of scope

- Persisting progress / streaks / spaced repetition.
- Scoring or "today's set is done" completion state.
- Using the domain `<details>` Quiz blobs (kept for future domain-review mode).
```
